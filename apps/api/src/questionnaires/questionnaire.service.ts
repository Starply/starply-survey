import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  PublishQuestionnaireResponse,
  QuestionnaireDetailResponse,
  QuestionnaireListResponse,
  QuestionnaireSummaryResponse,
  UpdateQuestionnaireDraftRequest,
} from '@starply/contracts';
import {
  createSurveyDraft,
  isValidLanguageTag,
  publishSurvey,
  resolveLocalizedText,
  SurveyValidationError,
  type LocalizedText,
  type SurveyContent,
  type SurveyDraft,
} from '@starply/questionnaire-core';
import { checkTenantSlug } from '@starply/tenancy-core';

import {
  QuestionnaireRepository,
  type QuestionnaireDetail,
  type QuestionnaireSummary,
} from './questionnaire.repository';

/**
 * 问卷应用服务：租户与权限由 TenantContextGuard 保证，这里只处理问卷领域规则。
 * - 创建时用 questionnaire-core 组装初始草稿（空分组，允许后续逐步补全）；
 * - 保存草稿不做全量 schema 校验，发布时才由 publishSurvey 校验并冻结快照；
 * - 已发布版本没有写入口，草稿后续修改不会影响历史快照。
 */
@Injectable()
export class QuestionnaireService {
  constructor(private readonly repository: QuestionnaireRepository) {}

  async create(
    tenantId: string,
    userId: string,
    body: unknown,
  ): Promise<QuestionnaireDetailResponse> {
    const input = readCreateRequest(body);

    const slug = checkTenantSlug(input.slug);
    if (!slug.ok) {
      throw new BadRequestException({
        code: 'invalid_slug',
        message: '问卷 slug 只允许小写字母、数字与连字符，长度 3-63',
      });
    }

    if (!isValidLanguageTag(input.defaultLanguage)) {
      throw new BadRequestException({
        code: 'invalid_request',
        message: 'defaultLanguage 必须是合法语言键，如 zh-CN',
      });
    }

    if (
      resolveLocalizedText(input.title, input.defaultLanguage, input.defaultLanguage) === undefined
    ) {
      throw new BadRequestException({
        code: 'invalid_request',
        message: `标题缺少默认语言 ${input.defaultLanguage} 的文案`,
      });
    }

    if (await this.repository.isSlugTaken(tenantId, slug.slug)) {
      throw new ConflictException({
        code: 'questionnaire_slug_taken',
        message: '该租户下已存在相同 slug 的问卷',
      });
    }

    const surveyId = randomUUID();
    const draft = createSurveyDraft({
      surveyId,
      defaultLanguage: input.defaultLanguage,
      title: input.title,
      description: input.description,
      groups: [],
    });

    const detail = await this.repository.create({
      id: surveyId,
      tenantId,
      slug: slug.slug,
      content: draft.content,
      createdBy: userId,
    });

    return toDetailResponse(detail);
  }

  async list(tenantId: string): Promise<QuestionnaireListResponse> {
    const summaries = await this.repository.listSummaries(tenantId);

    return { items: summaries.map(toSummaryResponse) };
  }

  async get(tenantId: string, questionnaireId: string): Promise<QuestionnaireDetailResponse> {
    const detail = await this.repository.findDetail(tenantId, questionnaireId);
    if (!detail) {
      throw questionnaireNotFound();
    }

    return toDetailResponse(detail);
  }

  async updateDraft(
    tenantId: string,
    questionnaireId: string,
    body: unknown,
  ): Promise<QuestionnaireDetailResponse> {
    const content = readDraftContent(body);
    const detail = await this.repository.replaceDraftContent(tenantId, questionnaireId, content);
    if (!detail) {
      throw questionnaireNotFound();
    }

    return toDetailResponse(detail);
  }

  /**
   * 删除问卷。
   * 问卷版本与回答通过外键级联删除，避免残留孤儿数据；不存在或跨租户时统一 404。
   */
  async delete(tenantId: string, questionnaireId: string): Promise<void> {
    const deleted = await this.repository.delete(tenantId, questionnaireId);
    if (!deleted) {
      throw questionnaireNotFound();
    }
  }

  async publish(tenantId: string, questionnaireId: string): Promise<PublishQuestionnaireResponse> {
    try {
      const outcome = await this.repository.publish(
        tenantId,
        questionnaireId,
        ({ draftContent, version }) => {
          const draft: SurveyDraft = {
            kind: 'draft',
            surveyId: questionnaireId,
            content: draftContent,
          };
          return publishSurvey(draft, { versionId: randomUUID(), version });
        },
      );

      if (!outcome.ok) {
        if (outcome.reason === 'not_found') {
          throw questionnaireNotFound();
        }

        throw new ConflictException({
          code: 'draft_missing',
          message: '问卷缺少可发布的草稿',
        });
      }

      return {
        versionId: outcome.version.id,
        version: outcome.version.version,
        schemaVersion: outcome.version.schemaVersion,
        publishedAt: outcome.version.publishedAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof SurveyValidationError) {
        throw new BadRequestException({
          code: 'survey_invalid',
          message: '问卷内容未通过校验，请先修正后重新发布',
          details: error.issues,
        });
      }

      throw error;
    }
  }
}

function questionnaireNotFound(): NotFoundException {
  return new NotFoundException({ code: 'questionnaire_not_found', message: '问卷不存在' });
}

interface CreateQuestionnaireInput {
  slug: string;
  defaultLanguage: string;
  title: LocalizedText;
  description?: LocalizedText;
}

function readCreateRequest(body: unknown): CreateQuestionnaireInput {
  const record = readObject(body);
  const slug = record['slug'];
  const defaultLanguage = record['defaultLanguage'];
  const title = record['title'];
  const description = record['description'];

  if (typeof slug !== 'string' || typeof defaultLanguage !== 'string' || !isLocalizedText(title)) {
    throw new BadRequestException({
      code: 'invalid_request',
      message: '需要 slug、defaultLanguage 与非空的多语言 title',
    });
  }

  if (description !== undefined && !isLocalizedText(description)) {
    throw new BadRequestException({
      code: 'invalid_request',
      message: 'description 必须是非空的多语言文本',
    });
  }

  return { slug, defaultLanguage, title, description };
}

/**
 * 草稿只要求 content 是对象：编辑器可以保存半成品，字段合法性留给发布校验。
 */
function readDraftContent(body: unknown): SurveyContent {
  const content = readObject(body)['content'];
  if (!isRecord(content)) {
    throw new BadRequestException({ code: 'invalid_request', message: '需要 content 对象' });
  }

  return content as unknown as UpdateQuestionnaireDraftRequest['content'];
}

function toSummaryResponse(summary: QuestionnaireSummary): QuestionnaireSummaryResponse {
  return {
    id: summary.id,
    slug: summary.slug,
    status: summary.status,
    title: summary.title,
    defaultLanguage: summary.defaultLanguage,
    createdAt: summary.createdAt.toISOString(),
    updatedAt: summary.updatedAt.toISOString(),
    publishedVersion: summary.publishedVersion,
    publishedAt: summary.publishedAt ? summary.publishedAt.toISOString() : null,
  };
}

function toDetailResponse(detail: QuestionnaireDetail): QuestionnaireDetailResponse {
  return {
    id: detail.id,
    tenantId: detail.tenantId,
    slug: detail.slug,
    status: detail.status,
    createdAt: detail.createdAt.toISOString(),
    updatedAt: detail.updatedAt.toISOString(),
    draft: {
      content: detail.draft.content,
      updatedAt: detail.draft.updatedAt.toISOString(),
    },
    published: detail.published
      ? {
          versionId: detail.published.id,
          version: detail.published.version,
          schemaVersion: detail.published.schemaVersion,
          publishedAt: detail.published.publishedAt.toISOString(),
          content: detail.published.content,
        }
      : null,
  };
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException({ code: 'invalid_request', message: '请求体必须是对象' });
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocalizedText(value: unknown): value is LocalizedText {
  if (!isRecord(value)) {
    return false;
  }

  const entries = Object.values(value);
  return (
    entries.length > 0 &&
    entries.every((text) => typeof text === 'string' && text.trim().length > 0)
  );
}
