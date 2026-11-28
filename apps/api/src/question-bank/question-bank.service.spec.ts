import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  QuestionBankRepository,
  type CreateQuestionBankItemInput,
  type QuestionBankItemState,
  type UpdateQuestionBankItemInput,
} from './question-bank.repository';
import { QuestionBankService } from './question-bank.service';

const now = new Date('2026-11-28T08:00:00.000Z');

/** 内存仓储：覆盖服务层的结构校验、租户隔离与 CRUD 语义。 */
class InMemoryQuestionBankRepository extends QuestionBankRepository {
  readonly items = new Map<string, QuestionBankItemState>();
  private sequence = 0;

  async list(tenantId: string): Promise<QuestionBankItemState[]> {
    return [...this.items.values()]
      .filter((item) => item.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  async find(tenantId: string, itemId: string): Promise<QuestionBankItemState | null> {
    const item = this.items.get(itemId);
    return item && item.tenantId === tenantId ? item : null;
  }

  async create(input: CreateQuestionBankItemInput): Promise<QuestionBankItemState> {
    this.sequence += 1;
    const timestamp = new Date(now.getTime() + this.sequence * 1_000);
    const item: QuestionBankItemState = {
      id: `item-${this.sequence}`,
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      description: input.description,
      config: input.config,
      tags: input.tags,
      createdBy: input.createdBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.items.set(item.id, item);

    return item;
  }

  async update(
    tenantId: string,
    itemId: string,
    patch: UpdateQuestionBankItemInput,
  ): Promise<QuestionBankItemState | null> {
    const item = await this.find(tenantId, itemId);
    if (!item) {
      return null;
    }

    this.sequence += 1;
    const updated: QuestionBankItemState = {
      ...item,
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.config !== undefined ? { config: patch.config } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags ?? [] } : {}),
      updatedAt: new Date(now.getTime() + this.sequence * 1_000),
    };
    this.items.set(itemId, updated);

    return updated;
  }

  async delete(tenantId: string, itemId: string): Promise<boolean> {
    const item = await this.find(tenantId, itemId);
    if (!item) {
      return false;
    }

    this.items.delete(itemId);
    return true;
  }
}

function createService(): {
  service: QuestionBankService;
  repository: InMemoryQuestionBankRepository;
} {
  const repository = new InMemoryQuestionBankRepository();

  return { service: new QuestionBankService(repository), repository };
}

function createRequest(): unknown {
  return {
    type: 'single_choice',
    title: { 'zh-CN': '您最常使用哪个渠道？' },
    description: { 'zh-CN': '选择一个最符合的选项' },
    config: { options: [{ id: 'o1', label: { 'zh-CN': '线上' } }] },
    tags: ['渠道', ' 渠道 ', '满意度'],
  };
}

async function capture<T>(action: () => Promise<unknown>): Promise<T> {
  return action().then(
    () => {
      throw new Error('预期抛出异常');
    },
    (error: unknown) => error as T,
  );
}

describe('QuestionBankService.create', () => {
  it('创建题库条目并去重标签', async () => {
    const { service } = createService();

    const created = await service.create('tenant-1', 'user-1', createRequest());

    expect(created).toMatchObject({
      type: 'single_choice',
      title: { 'zh-CN': '您最常使用哪个渠道？' },
      tags: ['渠道', '满意度'],
    });
    expect(created.config).toEqual({
      options: [{ id: 'o1', label: { 'zh-CN': '线上' } }],
    });
  });

  it('缺省 config/tags 时使用空对象与空数组', async () => {
    const { service } = createService();

    const created = await service.create('tenant-1', 'user-1', {
      type: 'text',
      title: { 'zh-CN': '姓名' },
    });

    expect(created.config).toEqual({});
    expect(created.tags).toEqual([]);
    expect(created.description).toBeNull();
  });

  it('非法题型或空标题返回 400', async () => {
    const { service } = createService();

    await expect(
      capture<BadRequestException>(() =>
        service.create('tenant-1', 'user-1', {
          ...(createRequest() as object),
          type: 'matrix',
        }),
      ),
    ).resolves.toMatchObject({ response: { code: 'invalid_request' } });

    await expect(
      capture<BadRequestException>(() =>
        service.create('tenant-1', 'user-1', {
          type: 'text',
          title: { 'zh-CN': '   ' },
        }),
      ),
    ).resolves.toMatchObject({ response: { code: 'invalid_request' } });
  });
});

describe('QuestionBankService.list / get', () => {
  it('只返回当前租户的条目并按更新时间倒序', async () => {
    const { service } = createService();
    const first = await service.create('tenant-1', 'user-1', {
      type: 'text',
      title: { 'zh-CN': '第一题' },
    });
    const second = await service.create('tenant-1', 'user-1', {
      type: 'rating',
      title: { 'zh-CN': '第二题' },
      config: { min: 1, max: 5 },
    });
    await service.create('tenant-2', 'user-1', {
      type: 'text',
      title: { 'zh-CN': '其他租户' },
    });

    const list = await service.list('tenant-1');

    expect(list.items.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(list.items[0]).not.toHaveProperty('config');
  });

  it('查询其他租户的条目返回 404', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());

    await expect(
      capture<NotFoundException>(() => service.get('tenant-2', created.id)),
    ).resolves.toMatchObject({ response: { code: 'question_bank_item_not_found' } });
  });
});

describe('QuestionBankService.update / delete', () => {
  it('更新标题并清空描述与标签', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());

    const updated = await service.update('tenant-1', created.id, {
      title: { 'zh-CN': '新的标题' },
      description: null,
      tags: null,
    });

    expect(updated.title).toEqual({ 'zh-CN': '新的标题' });
    expect(updated.description).toBeNull();
    expect(updated.tags).toEqual([]);
    expect(updated.type).toBe('single_choice');
  });

  it('更新不存在的条目返回 404', async () => {
    const { service } = createService();

    await expect(
      capture<NotFoundException>(() => service.update('tenant-1', 'missing', { tags: ['x'] })),
    ).resolves.toMatchObject({ response: { code: 'question_bank_item_not_found' } });
  });

  it('删除后列表为空，再次删除返回 404', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());

    await service.delete('tenant-1', created.id);

    await expect(service.list('tenant-1')).resolves.toEqual({ items: [] });
    await expect(
      capture<NotFoundException>(() => service.delete('tenant-1', created.id)),
    ).resolves.toMatchObject({ response: { code: 'question_bank_item_not_found' } });
  });
});
