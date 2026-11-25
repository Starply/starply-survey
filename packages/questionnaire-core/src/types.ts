/**
 * 问卷领域模型：纯类型与常量，不依赖任何框架或运行时。
 * 该文件同时被前端编辑器、后端服务与 packages/contracts 复用。
 */

export type SurveyId = string;
export type SurveyVersionId = string;
export type QuestionGroupId = string;
export type QuestionId = string;
export type OptionId = string;

/** 首版支持的题型。新增题型时同步扩展该常量与 Question 联合。 */
export const QUESTION_TYPES = [
  'text',
  'textarea',
  'number',
  'email',
  'date',
  'single_choice',
  'multi_choice',
  'rating',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// 题型配置
// ---------------------------------------------------------------------------

export interface TextQuestionConfig {
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
}

export interface TextareaQuestionConfig extends TextQuestionConfig {
  rows?: number;
}

export interface NumberQuestionConfig {
  placeholder?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  step?: number;
}

/** 日期使用 YYYY-MM-DD，避免时区歧义。 */
export interface DateQuestionConfig {
  min?: string;
  max?: string;
}

export interface ChoiceOption {
  id: OptionId;
  label: string;
  /** 提交值；缺省时使用 id。 */
  value?: string;
  /** 多选时标记“互斥项”，如“以上都不是”。 */
  exclusive?: boolean;
}

export type ChoiceLayout = 'vertical' | 'horizontal' | 'dropdown';

export interface SingleChoiceQuestionConfig {
  options: ChoiceOption[];
  layout?: ChoiceLayout;
  /** 是否允许取消已选项。 */
  allowClear?: boolean;
}

export interface MultipleChoiceQuestionConfig {
  options: ChoiceOption[];
  layout?: ChoiceLayout;
  minSelections?: number;
  maxSelections?: number;
}

export interface RatingLabel {
  value: number;
  label: string;
}

export interface RatingQuestionConfig {
  /** 默认 1。 */
  min?: number;
  max: number;
  /** 默认 1。 */
  step?: number;
  icon?: 'star' | 'heart' | 'number';
  labels?: RatingLabel[];
}

// ---------------------------------------------------------------------------
// 显示 / 跳转逻辑（仅数据结构，执行语义未定）
// ---------------------------------------------------------------------------

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'is_answered',
  'is_not_answered',
  'is_any_of',
  'is_none_of',
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export function isConditionOperator(value: unknown): value is ConditionOperator {
  return typeof value === 'string' && (CONDITION_OPERATORS as readonly string[]).includes(value);
}

export type ConditionValue = string | number | boolean | readonly string[] | readonly number[];

export interface QuestionConditionRule {
  kind: 'condition';
  sourceQuestionId: QuestionId;
  operator: ConditionOperator;
  /** is_answered / is_not_answered 不需要值，其余操作符必须有值。 */
  value?: ConditionValue;
}

export interface ConditionGroupNode {
  kind: 'group';
  combinator: 'and' | 'or';
  conditions: ConditionNode[];
}

export type ConditionNode = QuestionConditionRule | ConditionGroupNode;

export type JumpTarget =
  | { kind: 'question'; questionId: QuestionId }
  | { kind: 'group'; groupId: QuestionGroupId }
  | { kind: 'end' };

export interface JumpRule {
  id?: string;
  when: ConditionNode;
  target: JumpTarget;
}

export interface LogicDefinition {
  /** 条件为真时显示当前题目/分组。 */
  visibleWhen?: ConditionNode;
  /** 满足条件时跳转；执行优先级与冲突处理留待逻辑引擎确定。 */
  jumpRules?: JumpRule[];
}

// ---------------------------------------------------------------------------
// 题目 / 分组 / 问卷
// ---------------------------------------------------------------------------

/**
 * 通用题目基类。新增题型时以此声明，再加入 Question 联合。
 * config 承载题型专属配置，避免为每种题型扩宽 Question 顶层字段。
 */
export interface QuestionBase<TType extends string, TConfig> {
  id: QuestionId;
  type: TType;
  title: string;
  description?: string;
  /** 缺省视为 false。 */
  required?: boolean;
  config: TConfig;
  logic?: LogicDefinition;
}

export type TextQuestion = QuestionBase<'text', TextQuestionConfig>;
export type TextareaQuestion = QuestionBase<'textarea', TextareaQuestionConfig>;
export type NumberQuestion = QuestionBase<'number', NumberQuestionConfig>;
export type EmailQuestion = QuestionBase<'email', TextQuestionConfig>;
export type DateQuestion = QuestionBase<'date', DateQuestionConfig>;
export type SingleChoiceQuestion = QuestionBase<'single_choice', SingleChoiceQuestionConfig>;
export type MultipleChoiceQuestion = QuestionBase<'multi_choice', MultipleChoiceQuestionConfig>;
export type RatingQuestion = QuestionBase<'rating', RatingQuestionConfig>;

export type Question =
  | TextQuestion
  | TextareaQuestion
  | NumberQuestion
  | EmailQuestion
  | DateQuestion
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | RatingQuestion;

export interface QuestionGroup {
  id: QuestionGroupId;
  title?: string;
  description?: string;
  questions: Question[];
  logic?: LogicDefinition;
}

export interface SurveyContent {
  title: string;
  description?: string;
  groups: QuestionGroup[];
}

/** 递归只读，用于表达“发布后不可变”。 */
export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type ReadonlySurveyContent = DeepReadonly<SurveyContent>;

// ---------------------------------------------------------------------------
// 版本语义
// ---------------------------------------------------------------------------

export const QUESTIONNAIRE_SCHEMA_VERSION = 1;

export interface SurveyDraft {
  kind: 'draft';
  surveyId: SurveyId;
  content: SurveyContent;
}

export interface PublishedSurveyVersion {
  kind: 'published';
  surveyId: SurveyId;
  versionId: SurveyVersionId;
  /** 从 1 开始递增的版本号。 */
  version: number;
  /** 内容 schema 版本，用于后续迁移。 */
  schemaVersion: number;
  /** ISO 8601 时间。 */
  publishedAt: string;
  /** 发布时的内容快照，运行时已冻结。 */
  content: ReadonlySurveyContent;
}

export interface PublishSurveyOptions {
  versionId: SurveyVersionId;
  version: number;
  /** 缺省为当前时间。 */
  publishedAt?: string;
  /** 缺省为 QUESTIONNAIRE_SCHEMA_VERSION。 */
  schemaVersion?: number;
}

// ---------------------------------------------------------------------------
// 校验结果
// ---------------------------------------------------------------------------

export type ValidationIssueSeverity = 'error' | 'warning';

export type ValidationIssueCode =
  | 'INVALID_STRUCTURE'
  | 'EMPTY_SURVEY'
  | 'EMPTY_GROUP'
  | 'MISSING_ID'
  | 'DUPLICATE_GROUP_ID'
  | 'DUPLICATE_QUESTION_ID'
  | 'MISSING_TITLE'
  | 'UNSUPPORTED_QUESTION_TYPE'
  | 'INVALID_CHOICE_OPTIONS'
  | 'DUPLICATE_OPTION_ID'
  | 'DUPLICATE_OPTION_VALUE'
  | 'INVALID_SELECTION_RANGE'
  | 'INVALID_RATING_RANGE'
  | 'INVALID_TEXT_RANGE'
  | 'INVALID_NUMBER_RANGE'
  | 'INVALID_DATE_RANGE'
  | 'INVALID_LOGIC'
  | 'UNKNOWN_QUESTION_REFERENCE'
  | 'UNKNOWN_GROUP_REFERENCE'
  | 'OPERATOR_TYPE_MISMATCH'
  | 'LOGIC_NESTING_TOO_DEEP'
  | 'INVALID_VERSION';

export interface ValidationIssue {
  code: ValidationIssueCode;
  /** 面向开发者的中文说明。 */
  message: string;
  /** 形如 groups[0].questions[1].config.options。 */
  path: string;
  severity: ValidationIssueSeverity;
}

export interface ValidationResult {
  valid: boolean;
  issues: readonly ValidationIssue[];
  errors: readonly ValidationIssue[];
  warnings: readonly ValidationIssue[];
}
