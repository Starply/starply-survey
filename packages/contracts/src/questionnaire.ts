/**
 * 问卷领域类型的统一出口。
 * API 契约、管理端编辑器与填写页都从这里引用，避免各端重复声明。
 */
import type {
  LanguageTag,
  LocalizedText,
  ReadonlySurveyContent,
  SurveyContent,
} from '@starply/questionnaire-core';

export type {
  ChoiceLayout,
  ChoiceOption,
  ConditionGroupNode,
  ConditionNode,
  ConditionOperator,
  DateQuestionConfig,
  DeepReadonly,
  JumpRule,
  JumpTarget,
  LanguageTag,
  LocalizedText,
  LogicDefinition,
  MultipleChoiceQuestionConfig,
  NumberQuestionConfig,
  PublishedSurveyVersion,
  PublishSurveyOptions,
  Question,
  QuestionConditionRule,
  QuestionGroup,
  QuestionId,
  QuestionType,
  RatingQuestionConfig,
  ReadonlySurveyContent,
  SingleChoiceQuestionConfig,
  SurveyContent,
  SurveyDraft,
  TextQuestionConfig,
  TextareaQuestionConfig,
  ValidationIssue,
  ValidationResult,
} from '@starply/questionnaire-core';

// ---------------------------------------------------------------------------
// 问卷管理接口
// ---------------------------------------------------------------------------

/** 问卷状态：从未发布过为 draft，存在已发布版本后为 published。 */
export type QuestionnaireStatus = 'draft' | 'published';

/** 创建问卷：只需标题与默认语言，初始草稿为空分组，随后通过编辑接口补全内容。 */
export interface CreateQuestionnaireRequest {
  /** 租户内唯一的问卷短标识，规则与租户 slug 一致。 */
  slug: string;
  defaultLanguage: LanguageTag;
  title: LocalizedText;
  description?: LocalizedText;
}

/** 整体替换草稿内容；草稿允许未完成，发布时才做全量 schema 校验。 */
export interface UpdateQuestionnaireDraftRequest {
  content: SurveyContent;
}

export interface QuestionnaireDraftView {
  content: SurveyContent;
  /** 草稿最后更新时间（ISO 8601）。 */
  updatedAt: string;
}

/** 已发布版本的元信息，不含内容。 */
export interface PublishedVersionSummary {
  versionId: string;
  /** 从 1 开始递增的版本号。 */
  version: number;
  schemaVersion: number;
  /** 发布时间（ISO 8601）。 */
  publishedAt: string;
}

/** 已发布版本详情；content 为发布时固化的只读快照。 */
export interface PublishedVersionView extends PublishedVersionSummary {
  content: ReadonlySurveyContent;
}

export interface QuestionnaireDetailResponse {
  id: string;
  tenantId: string;
  slug: string;
  status: QuestionnaireStatus;
  createdAt: string;
  updatedAt: string;
  /** 当前可编辑草稿，始终存在。 */
  draft: QuestionnaireDraftView;
  /** 最新发布版本；从未发布时为 null。 */
  published: PublishedVersionView | null;
}

export type PublishQuestionnaireResponse = PublishedVersionSummary;

/** 问卷与租户上下文相关的错误码，前端据此决定提示与跳转。 */
export type QuestionnaireErrorCode =
  | 'invalid_request'
  | 'invalid_slug'
  | 'questionnaire_not_found'
  | 'questionnaire_slug_taken'
  | 'draft_missing'
  | 'survey_invalid'
  | 'tenant_not_found'
  | 'tenant_inactive'
  | 'membership_missing'
  | 'membership_inactive'
  | 'permission_denied'
  | 'unauthorized'
  | 'token_expired'
  | 'database_unavailable';
