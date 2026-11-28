/**
 * 问卷领域类型的统一出口。
 * API 契约、管理端编辑器与填写页都从这里引用，避免各端重复声明。
 */
import type {
  LanguageTag,
  LocalizedText,
  QuestionType,
  ReadonlySurveyContent,
  SurveyAnswers,
  SurveyContent,
} from '@starply/questionnaire-core';

export type {
  AnswerValue,
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
  SurveyAnswers,
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

/**
 * 列表项：标题与默认语言取自当前草稿，最后一次发布时间取自最新发布版本。
 * 不返回草稿完整内容，避免列表页加载整份 schema。
 */
export interface QuestionnaireSummaryResponse {
  id: string;
  slug: string;
  status: QuestionnaireStatus;
  title: LocalizedText;
  defaultLanguage: LanguageTag;
  createdAt: string;
  /** 草稿最后更新时间，作为列表排序依据。 */
  updatedAt: string;
  /** 从未发布时为 null。 */
  publishedVersion: number | null;
  publishedAt: string | null;
  /** 已收集的有效答卷数。 */
  responseCount: number;
}

/** 租户级问卷列表；当前为全量返回，分页留待列表规模增长后再加。 */
export interface QuestionnaireListResponse {
  items: QuestionnaireSummaryResponse[];
}

export type PublishQuestionnaireResponse = PublishedVersionSummary;

// ---------------------------------------------------------------------------
// 问卷统计与原始数据
// ---------------------------------------------------------------------------

/** 问卷统计概览：当前只提供总量与发布信息，按题统计后续再扩展。 */
export interface QuestionnaireStatsResponse {
  questionnaireId: string;
  responseCount: number;
  publishedVersion: number | null;
  lastPublishedAt: string | null;
  /** 按题目聚合的统计；未发布时为空数组。 */
  questions: readonly QuestionStatsResponse[];
}

/** 选项 / 评分的分布桶。 */
export interface AnswerDistributionBucket {
  /** 提交值；选择题取 option.value ?? option.id，评分题取分值字符串。 */
  value: string;
  label: LocalizedText;
  count: number;
}

/** 单个题目的统计结果。 */
export interface QuestionStatsResponse {
  questionId: string;
  title: LocalizedText;
  type: QuestionType;
  /** 有效作答份数；空字符串与空数组不计入。 */
  answeredCount: number;
  /** 选择题与评分题才有分布桶，其余题型为空数组。 */
  buckets: readonly AnswerDistributionBucket[];
}

/** 管理端查看的单条答卷，answers 保持 survey_response 中的原始结构。 */
export interface SurveyResponseSummary {
  id: string;
  /** 作答时对应的已发布版本号。 */
  version: number;
  language: LanguageTag | null;
  submittedAt: string;
  answers: SurveyAnswers;
}

/** 原始数据分页列表。 */
export interface SurveyResponseListResponse {
  items: SurveyResponseSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// 公开填写接口（无需登录）
// ---------------------------------------------------------------------------

/**
 * 公开问卷：只暴露最新已发布版本的内容快照。
 * 未发布的问卷不提供公开访问，避免草稿泄露。
 */
export interface PublicQuestionnaireResponse {
  questionnaireId: string;
  tenantSlug: string;
  slug: string;
  version: number;
  schemaVersion: number;
  publishedAt: string;
  content: ReadonlySurveyContent;
}

/** 提交回答：answers 以题目 id 为键，language 记录填写时使用的语言。 */
export interface SubmitSurveyResponseRequest {
  answers: SurveyAnswers;
  language?: LanguageTag;
}

export interface SubmitSurveyResponseResult {
  responseId: string;
  /** 提交时间（ISO 8601）。 */
  submittedAt: string;
}

/** 问卷与租户上下文相关的错误码，前端据此决定提示与跳转。 */
export type QuestionnaireErrorCode =
  | 'invalid_request'
  | 'invalid_slug'
  | 'questionnaire_not_found'
  | 'questionnaire_slug_taken'
  | 'questionnaire_not_published'
  | 'answers_invalid'
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
