import type { QuestionnaireStatus } from '@starply/contracts';
import type {
  LanguageTag,
  LocalizedText,
  PublishedSurveyVersion,
  ReadonlySurveyContent,
  SurveyContent,
} from '@starply/questionnaire-core';

export interface QuestionnaireDraftState {
  id: string;
  content: SurveyContent;
  updatedAt: Date;
}

export interface PublishedVersionState {
  id: string;
  version: number;
  schemaVersion: number;
  publishedAt: Date;
  content: ReadonlySurveyContent;
}

/** 问卷详情：草稿始终存在，发布版本可能为 null。 */
export interface QuestionnaireDetail {
  id: string;
  tenantId: string;
  slug: string;
  status: QuestionnaireStatus;
  createdAt: Date;
  updatedAt: Date;
  draft: QuestionnaireDraftState;
  published: PublishedVersionState | null;
}

/** 列表概览：只取展示所需字段，不加载草稿完整内容。 */
export interface QuestionnaireSummary {
  id: string;
  slug: string;
  status: QuestionnaireStatus;
  title: LocalizedText;
  defaultLanguage: LanguageTag;
  createdAt: Date;
  /** 草稿最后更新时间。 */
  updatedAt: Date;
  publishedVersion: number | null;
  publishedAt: Date | null;
}

export interface CreateQuestionnaireInput {
  /** 由服务层生成，同时作为 questionnaire-core 中的 surveyId。 */
  id: string;
  tenantId: string;
  slug: string;
  content: SurveyContent;
  createdBy: string;
}

export interface PublishSnapshotInput {
  draftContent: SurveyContent;
  /** 事务内计算出的下一个版本号。 */
  version: number;
}

/**
 * 发布快照构建器。
 * 版本号只有在事务里获取锁之后才能确定，因此由仓储在事务中调用该回调；
 * 回调通常直接调用 questionnaire-core 的 publishSurvey，校验失败会中断事务。
 */
export type PublishedSnapshotBuilder = (input: PublishSnapshotInput) => PublishedSurveyVersion;

export type PublishQuestionnaireOutcome =
  | { ok: true; version: PublishedVersionState }
  | { ok: false; reason: 'not_found' | 'draft_missing' };

/**
 * 问卷持久化端口。
 * 服务层只依赖该接口，便于用内存实现覆盖创建、编辑与发布语义。
 */
export abstract class QuestionnaireRepository {
  abstract isSlugTaken(tenantId: string, slug: string): Promise<boolean>;

  abstract create(input: CreateQuestionnaireInput): Promise<QuestionnaireDetail>;

  /** 租户级全量列表，按草稿更新时间倒序。 */
  abstract listSummaries(tenantId: string): Promise<QuestionnaireSummary[]>;

  abstract findDetail(
    tenantId: string,
    questionnaireId: string,
  ): Promise<QuestionnaireDetail | null>;

  abstract replaceDraftContent(
    tenantId: string,
    questionnaireId: string,
    content: SurveyContent,
  ): Promise<QuestionnaireDetail | null>;

  abstract publish(
    tenantId: string,
    questionnaireId: string,
    buildSnapshot: PublishedSnapshotBuilder,
  ): Promise<PublishQuestionnaireOutcome>;
}
