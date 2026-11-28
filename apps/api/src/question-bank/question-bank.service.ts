import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LocalizedText,
  QuestionBankItemConfig,
  QuestionBankItemDetailResponse,
  QuestionBankItemListResponse,
  QuestionBankItemSummaryResponse,
  QuestionType,
} from '@starply/contracts';
import { isQuestionType } from '@starply/questionnaire-core';

import {
  QuestionBankRepository,
  type QuestionBankItemState,
  type UpdateQuestionBankItemInput,
} from './question-bank.repository';

/**
 * 题库应用服务：租户与权限由 TenantContextGuard 保证，这里只做结构校验。
 * 题库条目是题目模板，不参与发布校验，因此 config 只要求是对象；
 * 题型专属字段由前端编辑器保证，后续从题库复制到问卷时再走 questionnaire-core 校验。
 */
@Injectable()
export class QuestionBankService {
  constructor(private readonly repository: QuestionBankRepository) {}

  async list(tenantId: string): Promise<QuestionBankItemListResponse> {
    const items = await this.repository.list(tenantId);

    return { items: items.map(toSummaryResponse) };
  }

  async get(tenantId: string, itemId: string): Promise<QuestionBankItemDetailResponse> {
    const item = await this.repository.find(tenantId, itemId);
    if (!item) {
      throw itemNotFound();
    }

    return toDetailResponse(item);
  }

  async create(
    tenantId: string,
    userId: string,
    body: unknown,
  ): Promise<QuestionBankItemDetailResponse> {
    const record = readObject(body);
    const type = requireQuestionType(record['type']);
    const title = requireLocalizedText(record['title'], 'title');
    const description = readLocalizedTextOrNull(record['description'], 'description') ?? null;
    const config = readConfig(record['config']) ?? {};
    const tags = readTags(record['tags']) ?? [];

    const created = await this.repository.create({
      tenantId,
      type,
      title,
      description,
      config,
      tags,
      createdBy: userId,
    });

    return toDetailResponse(created);
  }

  async update(
    tenantId: string,
    itemId: string,
    body: unknown,
  ): Promise<QuestionBankItemDetailResponse> {
    const record = readObject(body);
    const patch: UpdateQuestionBankItemInput = {};

    if (has(record, 'type')) {
      patch.type = requireQuestionType(record['type']);
    }
    if (has(record, 'title')) {
      patch.title = requireLocalizedText(record['title'], 'title');
    }
    if (has(record, 'description')) {
      patch.description = readLocalizedTextOrNull(record['description'], 'description') ?? null;
    }
    if (has(record, 'config')) {
      patch.config = readConfig(record['config']);
    }
    if (has(record, 'tags')) {
      patch.tags = readTags(record['tags']) ?? null;
    }

    const updated = await this.repository.update(tenantId, itemId, patch);
    if (!updated) {
      throw itemNotFound();
    }

    return toDetailResponse(updated);
  }

  async delete(tenantId: string, itemId: string): Promise<void> {
    const deleted = await this.repository.delete(tenantId, itemId);
    if (!deleted) {
      throw itemNotFound();
    }
  }
}

function itemNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'question_bank_item_not_found',
    message: '题库条目不存在',
  });
}

function invalidRequest(message: string): BadRequestException {
  return new BadRequestException({ code: 'invalid_request', message });
}

function requireQuestionType(value: unknown): QuestionType {
  if (!isQuestionType(value)) {
    throw invalidRequest('type 必须是受支持的题型');
  }

  return value;
}

function requireLocalizedText(value: unknown, field: string): LocalizedText {
  if (!isLocalizedText(value)) {
    throw invalidRequest(`${field} 必须是非空的多语言文本`);
  }

  return value;
}

/** 允许 null 清空描述；undefined 表示未提供。 */
function readLocalizedTextOrNull(value: unknown, field: string): LocalizedText | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  if (!isLocalizedText(value)) {
    throw invalidRequest(`${field} 必须是非空的多语言文本`);
  }

  return value;
}

/** 创建时缺省为空对象；更新时必须是对象。 */
function readConfig(value: unknown): QuestionBankItemConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw invalidRequest('config 必须是对象');
  }

  return value as unknown as QuestionBankItemConfig;
}

/** 去掉空白标签并去重；null 表示清空，undefined 表示未提供。 */
function readTags(value: unknown): string[] | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  if (!Array.isArray(value)) {
    throw invalidRequest('tags 必须是字符串数组');
  }

  const tags: string[] = [];
  for (const tag of value) {
    if (typeof tag !== 'string') {
      throw invalidRequest('tags 必须是字符串数组');
    }
    const trimmed = tag.trim();
    if (trimmed.length > 0 && !tags.includes(trimmed)) {
      tags.push(trimmed);
    }
  }

  return tags;
}

function toSummaryResponse(item: QuestionBankItemState): QuestionBankItemSummaryResponse {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    tags: item.tags,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toDetailResponse(item: QuestionBankItemState): QuestionBankItemDetailResponse {
  return { ...toSummaryResponse(item), config: item.config };
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidRequest('请求体必须是对象');
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

function has(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
