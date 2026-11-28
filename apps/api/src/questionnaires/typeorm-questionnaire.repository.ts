import { Injectable } from '@nestjs/common';
import {
  QUESTIONNAIRE_SCHEMA_VERSION,
  type SurveyAnswers,
  type SurveyContent,
} from '@starply/questionnaire-core';
import { In, type DataSource, type EntityManager } from 'typeorm';

import { DatabaseService } from '../database/database.service';
import { Questionnaire, QuestionnaireVersion, SurveyResponse } from '../database/entities';
import {
  QuestionnaireRepository,
  type CreateQuestionnaireInput,
  type PublishQuestionnaireOutcome,
  type PublishedSnapshotBuilder,
  type QuestionnaireDetail,
  type QuestionnaireSummary,
  type PublishedVersionState,
  type SurveyResponsePage,
  type SurveyResponseState,
} from './questionnaire.repository';

/**
 * 基于 TypeORM 的问卷仓储。
 * 发布流程在一个事务内完成：锁问卷行 → 取当前最大版本号 → 由核心生成冻结快照 → 写版本并移动指针。
 * 并发发布会串行化，避免两个请求拿到同一个版本号。
 */
@Injectable()
export class TypeormQuestionnaireRepository extends QuestionnaireRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  private get dataSource(): DataSource {
    return this.database.getDataSource();
  }

  async isSlugTaken(tenantId: string, slug: string): Promise<boolean> {
    const count = await this.dataSource
      .getRepository(Questionnaire)
      .count({ where: { tenantId, slug } });

    return count > 0;
  }

  async create(input: CreateQuestionnaireInput): Promise<QuestionnaireDetail> {
    return this.dataSource.transaction(async (manager) => {
      const questionnaires = manager.getRepository(Questionnaire);
      const versions = manager.getRepository(QuestionnaireVersion);

      const questionnaire = questionnaires.create({
        id: input.id,
        tenantId: input.tenantId,
        slug: input.slug,
        status: 'draft',
        draftVersionId: null,
        publishedVersionId: null,
        createdBy: input.createdBy,
      });
      await questionnaires.save(questionnaire);

      const draft = versions.create({
        tenantId: input.tenantId,
        questionnaireId: questionnaire.id,
        status: 'draft',
        version: null,
        schemaVersion: QUESTIONNAIRE_SCHEMA_VERSION,
        content: input.content,
        publishedAt: null,
        createdBy: input.createdBy,
      });
      await versions.save(draft);

      questionnaire.draftVersionId = draft.id;
      await questionnaires.save(questionnaire);

      return {
        id: questionnaire.id,
        tenantId: questionnaire.tenantId,
        slug: questionnaire.slug,
        status: questionnaire.status,
        createdAt: questionnaire.createdAt,
        updatedAt: questionnaire.updatedAt,
        draft: {
          id: draft.id,
          content: readContent(draft.content),
          updatedAt: draft.updatedAt,
        },
        published: null,
      };
    });
  }

  /**
   * 列表按草稿更新时间排序：草稿保存在版本表，问卷主体的 updatedAt 不会随之变化，
   * 因此排序放在内存中完成，避免额外的 SQL 联表。
   */
  async listSummaries(tenantId: string): Promise<QuestionnaireSummary[]> {
    const questionnaires = await this.dataSource
      .getRepository(Questionnaire)
      .find({ where: { tenantId } });

    const versionIds = questionnaires
      .flatMap((item) => [item.draftVersionId, item.publishedVersionId])
      .filter((id): id is string => typeof id === 'string');
    if (versionIds.length === 0) {
      return [];
    }

    const versions = await this.dataSource
      .getRepository(QuestionnaireVersion)
      .find({ where: { id: In(versionIds) } });
    const versionById = new Map(versions.map((version) => [version.id, version]));

    const responseRows = await this.dataSource
      .getRepository(SurveyResponse)
      .createQueryBuilder('response')
      .select('response.questionnaireId', 'questionnaireId')
      .addSelect('COUNT(*)', 'count')
      .where('response.tenantId = :tenantId', { tenantId })
      .groupBy('response.questionnaireId')
      .getRawMany<{ questionnaireId: string; count: string }>();
    const responseCountBy = new Map(
      responseRows.map((row) => [row.questionnaireId, Number(row.count)]),
    );

    const summaries: QuestionnaireSummary[] = [];
    for (const questionnaire of questionnaires) {
      const draft = questionnaire.draftVersionId
        ? versionById.get(questionnaire.draftVersionId)
        : undefined;
      if (!draft) {
        continue;
      }

      const content = readContent(draft.content);
      const published = questionnaire.publishedVersionId
        ? versionById.get(questionnaire.publishedVersionId)
        : undefined;

      summaries.push({
        id: questionnaire.id,
        slug: questionnaire.slug,
        status: questionnaire.status,
        title: content.title,
        defaultLanguage: content.defaultLanguage,
        createdAt: questionnaire.createdAt,
        updatedAt: draft.updatedAt,
        publishedVersion: published?.version ?? null,
        publishedAt: published?.publishedAt ?? null,
        responseCount: responseCountBy.get(questionnaire.id) ?? 0,
      });
    }

    return summaries.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  async findDetail(tenantId: string, questionnaireId: string): Promise<QuestionnaireDetail | null> {
    const questionnaire = await this.dataSource
      .getRepository(Questionnaire)
      .findOne({ where: { id: questionnaireId, tenantId } });

    if (!questionnaire?.draftVersionId) {
      return null;
    }

    const versionIds = [questionnaire.draftVersionId, questionnaire.publishedVersionId].filter(
      (id): id is string => typeof id === 'string',
    );
    const versions = await this.dataSource
      .getRepository(QuestionnaireVersion)
      .find({ where: { id: In(versionIds) } });

    const draft = versions.find((item) => item.id === questionnaire.draftVersionId);
    if (!draft) {
      return null;
    }

    const published = versions.find((item) => item.id === questionnaire.publishedVersionId);

    return {
      id: questionnaire.id,
      tenantId: questionnaire.tenantId,
      slug: questionnaire.slug,
      status: questionnaire.status,
      createdAt: questionnaire.createdAt,
      updatedAt: questionnaire.updatedAt,
      draft: {
        id: draft.id,
        content: readContent(draft.content),
        updatedAt: draft.updatedAt,
      },
      published: published ? toPublishedState(published) : null,
    };
  }

  async replaceDraftContent(
    tenantId: string,
    questionnaireId: string,
    content: SurveyContent,
  ): Promise<QuestionnaireDetail | null> {
    const questionnaire = await this.dataSource
      .getRepository(Questionnaire)
      .findOne({ where: { id: questionnaireId, tenantId } });

    if (!questionnaire?.draftVersionId) {
      return null;
    }

    const versions = this.dataSource.getRepository(QuestionnaireVersion);
    const draft = await versions.findOne({ where: { id: questionnaire.draftVersionId } });
    if (!draft) {
      return null;
    }

    draft.content = content;
    await versions.save(draft);

    return this.findDetail(tenantId, questionnaireId);
  }

  async publish(
    tenantId: string,
    questionnaireId: string,
    buildSnapshot: PublishedSnapshotBuilder,
  ): Promise<PublishQuestionnaireOutcome> {
    return this.dataSource.transaction(async (manager) => {
      const questionnaire = await this.lockQuestionnaire(manager, tenantId, questionnaireId);
      if (!questionnaire) {
        return { ok: false, reason: 'not_found' };
      }
      if (!questionnaire.draftVersionId) {
        return { ok: false, reason: 'draft_missing' };
      }

      const versions = manager.getRepository(QuestionnaireVersion);
      const draft = await versions.findOne({ where: { id: questionnaire.draftVersionId } });
      if (!draft) {
        return { ok: false, reason: 'draft_missing' };
      }

      const version = (await this.readLatestVersion(manager, questionnaireId)) + 1;
      const snapshot = buildSnapshot({ draftContent: readContent(draft.content), version });

      const published = versions.create({
        tenantId,
        questionnaireId,
        status: 'published',
        version: snapshot.version,
        schemaVersion: snapshot.schemaVersion,
        content: snapshot.content as SurveyContent,
        publishedAt: new Date(snapshot.publishedAt),
        createdBy: questionnaire.createdBy,
      });
      await versions.save(published);

      questionnaire.publishedVersionId = published.id;
      questionnaire.status = 'published';
      await manager.getRepository(Questionnaire).save(questionnaire);

      return { ok: true, version: toPublishedState(published) };
    });
  }

  async delete(tenantId: string, questionnaireId: string): Promise<boolean> {
    const result = await this.dataSource
      .getRepository(Questionnaire)
      .delete({ id: questionnaireId, tenantId });

    return (result.affected ?? 0) > 0;
  }

  async countResponses(tenantId: string, questionnaireId: string): Promise<number> {
    return this.dataSource
      .getRepository(SurveyResponse)
      .count({ where: { tenantId, questionnaireId } });
  }

  async listResponses(
    tenantId: string,
    questionnaireId: string,
    offset: number,
    limit: number,
  ): Promise<SurveyResponsePage> {
    const [rows, total] = await this.dataSource.getRepository(SurveyResponse).findAndCount({
      where: { tenantId, questionnaireId },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        version: row.version,
        language: row.language,
        submittedAt: row.createdAt,
        answers: row.answers,
      })),
      total,
    };
  }

  async listAnswers(tenantId: string, questionnaireId: string): Promise<SurveyAnswers[]> {
    const rows = await this.dataSource.getRepository(SurveyResponse).find({
      where: { tenantId, questionnaireId },
      order: { createdAt: 'ASC' },
      select: { answers: true },
    });

    return rows.map((row) => row.answers);
  }

  async listAllResponses(
    tenantId: string,
    questionnaireId: string,
  ): Promise<SurveyResponseState[]> {
    const rows = await this.dataSource.getRepository(SurveyResponse).find({
      where: { tenantId, questionnaireId },
      order: { createdAt: 'ASC' },
    });

    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      language: row.language,
      submittedAt: row.createdAt,
      answers: row.answers,
    }));
  }

  /** 锁住问卷行，串行化同一问卷的发布；锁必须处于事务中。 */
  private lockQuestionnaire(
    manager: EntityManager,
    tenantId: string,
    questionnaireId: string,
  ): Promise<Questionnaire | null> {
    return manager.getRepository(Questionnaire).findOne({
      where: { id: questionnaireId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async readLatestVersion(
    manager: EntityManager,
    questionnaireId: string,
  ): Promise<number> {
    const row = await manager
      .getRepository(QuestionnaireVersion)
      .createQueryBuilder('version')
      .select('version.version', 'version')
      .where('version.questionnaire_id = :questionnaireId', { questionnaireId })
      .andWhere('version.status = :status', { status: 'published' })
      .orderBy('version.version', 'DESC')
      .limit(1)
      .getRawOne<{ version: number | null }>();

    return Number(row?.version ?? 0);
  }
}

function toPublishedState(version: QuestionnaireVersion): PublishedVersionState {
  return {
    id: version.id,
    version: version.version ?? 0,
    schemaVersion: version.schemaVersion,
    publishedAt: version.publishedAt ?? new Date(0),
    content: readContent(version.content) as PublishedVersionState['content'],
  };
}

/**
 * mysql2 通常已把 JSON 列解析为对象；个别驱动/版本会返回字符串，这里统一兜底。
 */
function readContent(value: unknown): SurveyContent {
  if (typeof value === 'string') {
    return JSON.parse(value) as SurveyContent;
  }

  return value as SurveyContent;
}
