import { Injectable } from '@nestjs/common';
import type { ReadonlySurveyContent, SurveyContent } from '@starply/questionnaire-core';
import type { DataSource } from 'typeorm';

import { DatabaseService } from '../database/database.service';
import { Questionnaire, QuestionnaireVersion, SurveyResponse, Tenant } from '../database/entities';
import {
  SurveyResponseRepository,
  type CreateSurveyResponseInput,
  type PublicQuestionnaireLookup,
  type SurveyResponseRecord,
} from './survey-response.repository';

/**
 * 基于 TypeORM 的公开填写仓储。
 * 查询顺序固定为 租户 → 问卷 → 已发布版本；租户不存在/停用与问卷未发布分别返回不同原因。
 */
@Injectable()
export class TypeormSurveyResponseRepository extends SurveyResponseRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  private get dataSource(): DataSource {
    return this.database.getDataSource();
  }

  async findPublishedQuestionnaire(
    tenantSlug: string,
    questionnaireId: string,
  ): Promise<PublicQuestionnaireLookup> {
    const tenant = await this.dataSource
      .getRepository(Tenant)
      .findOne({ where: { slug: tenantSlug } });
    if (!tenant) {
      return { ok: false, reason: 'tenant_not_found' };
    }
    if (tenant.status !== 'active') {
      return { ok: false, reason: 'tenant_inactive' };
    }

    const questionnaire = await this.dataSource
      .getRepository(Questionnaire)
      .findOne({ where: { id: questionnaireId, tenantId: tenant.id } });
    if (!questionnaire?.publishedVersionId) {
      return { ok: false, reason: 'not_published' };
    }

    const version = await this.dataSource
      .getRepository(QuestionnaireVersion)
      .findOne({ where: { id: questionnaire.publishedVersionId } });
    if (!version || version.status !== 'published') {
      return { ok: false, reason: 'not_published' };
    }

    return {
      ok: true,
      snapshot: {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        questionnaireId: questionnaire.id,
        questionnaireVersionId: version.id,
        slug: questionnaire.slug,
        version: version.version ?? 0,
        schemaVersion: version.schemaVersion,
        publishedAt: version.publishedAt ?? new Date(0),
        content: readContent(version.content) as ReadonlySurveyContent,
      },
    };
  }

  async create(input: CreateSurveyResponseInput): Promise<SurveyResponseRecord> {
    const repository = this.dataSource.getRepository(SurveyResponse);
    const saved = await repository.save(
      repository.create({
        tenantId: input.tenantId,
        questionnaireId: input.questionnaireId,
        questionnaireVersionId: input.questionnaireVersionId,
        version: input.version,
        language: input.language,
        answers: input.answers,
      }),
    );

    return { id: saved.id, submittedAt: saved.createdAt };
  }
}

/** mysql2 通常已把 JSON 列解析为对象，个别驱动版本会返回字符串，这里统一兜底。 */
function readContent(value: unknown): SurveyContent {
  if (typeof value === 'string') {
    return JSON.parse(value) as SurveyContent;
  }

  return value as SurveyContent;
}
