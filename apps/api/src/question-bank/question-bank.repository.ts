import type { LocalizedText, QuestionBankItemConfig, QuestionType } from '@starply/contracts';

/** 题库条目的领域状态；时间字段保持 Date，由服务层转 ISO 字符串。 */
export interface QuestionBankItemState {
  id: string;
  tenantId: string;
  type: QuestionType;
  title: LocalizedText;
  description: LocalizedText | null;
  config: QuestionBankItemConfig;
  tags: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateQuestionBankItemInput {
  tenantId: string;
  type: QuestionType;
  title: LocalizedText;
  description: LocalizedText | null;
  config: QuestionBankItemConfig;
  tags: string[];
  createdBy: string | null;
}

/** 只包含需要变更的字段；description/tags 传 null 表示清空。 */
export interface UpdateQuestionBankItemInput {
  type?: QuestionType;
  title?: LocalizedText;
  description?: LocalizedText | null;
  config?: QuestionBankItemConfig;
  tags?: string[] | null;
}

/**
 * 题库持久化端口。
 * 服务层只依赖该接口，便于用内存实现覆盖 CRUD 语义与租户隔离。
 */
export abstract class QuestionBankRepository {
  /** 租户级全量列表，按更新时间倒序。 */
  abstract list(tenantId: string): Promise<QuestionBankItemState[]>;

  abstract find(tenantId: string, itemId: string): Promise<QuestionBankItemState | null>;

  abstract create(input: CreateQuestionBankItemInput): Promise<QuestionBankItemState>;

  abstract update(
    tenantId: string,
    itemId: string,
    patch: UpdateQuestionBankItemInput,
  ): Promise<QuestionBankItemState | null>;

  abstract delete(tenantId: string, itemId: string): Promise<boolean>;
}
