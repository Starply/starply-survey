/**
 * 题库契约：可复用的题目模板。
 * 与问卷编辑器共用 question-core 的题型模型，config 直接使用题目配置的联合类型。
 */
import type { LocalizedText, Question, QuestionType } from './questionnaire';

export type QuestionBankItemConfig = Question['config'];

export interface CreateQuestionBankItemRequest {
  type: QuestionType;
  title: LocalizedText;
  description?: LocalizedText;
  /** 题型专属配置；缺省时使用空对象（选择题与评分题由前端提供默认值）。 */
  config?: QuestionBankItemConfig;
  tags?: string[];
}

export interface UpdateQuestionBankItemRequest {
  type?: QuestionType;
  title?: LocalizedText;
  /** 传 null 表示清空描述。 */
  description?: LocalizedText | null;
  config?: QuestionBankItemConfig;
  /** 传 null 表示清空标签。 */
  tags?: string[] | null;
}

/** 列表项：不返回 config，避免列表加载大对象。 */
export interface QuestionBankItemSummaryResponse {
  id: string;
  type: QuestionType;
  title: LocalizedText;
  description: LocalizedText | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionBankItemDetailResponse extends QuestionBankItemSummaryResponse {
  config: QuestionBankItemConfig;
}

export interface QuestionBankItemListResponse {
  items: QuestionBankItemSummaryResponse[];
}

export type QuestionBankErrorCode =
  'invalid_request' | 'question_bank_item_not_found' | 'permission_denied';
