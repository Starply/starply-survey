import type { ReadonlySurveyContent, SurveyAnswers } from '@starply/questionnaire-core';

/** 公开填写可见的已发布快照。 */
export interface PublishedQuestionnaireSnapshot {
  tenantId: string;
  tenantSlug: string;
  questionnaireId: string;
  questionnaireVersionId: string;
  slug: string;
  version: number;
  schemaVersion: number;
  publishedAt: Date;
  content: ReadonlySurveyContent;
}

export type PublicQuestionnaireFailure = 'tenant_not_found' | 'tenant_inactive' | 'not_published';

/**
 * 公开问卷查询结果。
 * 用判别联合表达失败原因，服务层据此映射为 404/403，避免把“未发布”当成租户问题。
 */
export type PublicQuestionnaireLookup =
  | { ok: true; snapshot: PublishedQuestionnaireSnapshot }
  | { ok: false; reason: PublicQuestionnaireFailure };

export interface CreateSurveyResponseInput {
  tenantId: string;
  questionnaireId: string;
  questionnaireVersionId: string;
  version: number;
  language: string | null;
  answers: SurveyAnswers;
}

export interface SurveyResponseRecord {
  id: string;
  submittedAt: Date;
}

/**
 * 公开填写持久化端口。
 * 服务层只依赖该接口，便于用内存实现覆盖填写与提交语义。
 */
export abstract class SurveyResponseRepository {
  abstract findPublishedQuestionnaire(
    tenantSlug: string,
    questionnaireId: string,
  ): Promise<PublicQuestionnaireLookup>;

  abstract create(input: CreateSurveyResponseInput): Promise<SurveyResponseRecord>;
}
