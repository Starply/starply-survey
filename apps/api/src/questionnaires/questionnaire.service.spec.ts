import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { SurveyContent } from '@starply/questionnaire-core';
import { describe, expect, it } from 'vitest';

import {
  QuestionnaireRepository,
  type CreateQuestionnaireInput,
  type PublishQuestionnaireOutcome,
  type PublishedSnapshotBuilder,
  type PublishedVersionState,
  type QuestionnaireDetail,
  type QuestionnaireSummary,
  type SurveyResponsePage,
  type SurveyResponseState,
} from './questionnaire.repository';
import { QuestionnaireService } from './questionnaire.service';

const now = new Date('2026-11-27T08:00:00.000Z');

const validContent = (title = '客户满意度调查'): SurveyContent => ({
  defaultLanguage: 'zh-CN',
  title: { 'zh-CN': title },
  groups: [
    {
      id: 'g1',
      questions: [{ id: 'q1', type: 'text', title: { 'zh-CN': '姓名' }, config: {} }],
    },
  ],
});

/**
 * 内存仓储：只用于覆盖服务层的创建、编辑与发布语义，
 * 发布时同样深拷贝快照，模拟数据库隔离草稿与历史版本。
 */
class InMemoryQuestionnaireRepository extends QuestionnaireRepository {
  readonly details = new Map<string, QuestionnaireDetail>();
  readonly publishedHistory: PublishedVersionState[] = [];
  /** 测试用答卷；键为问卷 id。 */
  readonly responses = new Map<string, SurveyResponseState[]>();
  /** 单调递增的时钟，保证列表排序断言不受同毫秒写入影响。 */
  private clock = 0;

  private stamp(): Date {
    this.clock += 1;
    return new Date(now.getTime() + this.clock * 1_000);
  }

  async isSlugTaken(tenantId: string, slug: string): Promise<boolean> {
    return this.findBySlug(tenantId, slug) !== null;
  }

  async create(input: CreateQuestionnaireInput): Promise<QuestionnaireDetail> {
    const createdAt = this.stamp();
    const detail: QuestionnaireDetail = {
      id: input.id,
      tenantId: input.tenantId,
      slug: input.slug,
      status: 'draft',
      createdAt,
      updatedAt: createdAt,
      draft: { id: `draft-${input.id}`, content: clone(input.content), updatedAt: createdAt },
      published: null,
    };
    this.details.set(input.id, detail);

    return detail;
  }

  async listSummaries(tenantId: string): Promise<QuestionnaireSummary[]> {
    return [...this.details.values()]
      .filter((detail) => detail.tenantId === tenantId)
      .map((detail) => ({
        id: detail.id,
        slug: detail.slug,
        status: detail.status,
        title: detail.draft.content.title,
        defaultLanguage: detail.draft.content.defaultLanguage,
        createdAt: detail.createdAt,
        updatedAt: detail.draft.updatedAt,
        publishedVersion: detail.published?.version ?? null,
        publishedAt: detail.published?.publishedAt ?? null,
        responseCount: (this.responses.get(detail.id) ?? []).length,
      }))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  async findDetail(tenantId: string, questionnaireId: string): Promise<QuestionnaireDetail | null> {
    const detail = this.details.get(questionnaireId);
    return detail && detail.tenantId === tenantId ? detail : null;
  }

  async replaceDraftContent(
    tenantId: string,
    questionnaireId: string,
    content: SurveyContent,
  ): Promise<QuestionnaireDetail | null> {
    const detail = await this.findDetail(tenantId, questionnaireId);
    if (!detail) {
      return null;
    }

    const updatedAt = this.stamp();
    const updated: QuestionnaireDetail = {
      ...detail,
      updatedAt,
      draft: {
        ...detail.draft,
        content: clone(content),
        updatedAt,
      },
    };
    this.details.set(questionnaireId, updated);

    return updated;
  }

  async publish(
    tenantId: string,
    questionnaireId: string,
    buildSnapshot: PublishedSnapshotBuilder,
  ): Promise<PublishQuestionnaireOutcome> {
    const detail = await this.findDetail(tenantId, questionnaireId);
    if (!detail) {
      return { ok: false, reason: 'not_found' };
    }

    const version = (detail.published?.version ?? 0) + 1;
    const snapshot = buildSnapshot({ draftContent: detail.draft.content, version });
    const published: PublishedVersionState = {
      id: snapshot.versionId,
      version: snapshot.version,
      schemaVersion: snapshot.schemaVersion,
      publishedAt: new Date(snapshot.publishedAt),
      content: clone(snapshot.content),
    };
    this.publishedHistory.push(published);
    this.details.set(questionnaireId, {
      ...detail,
      status: 'published',
      published,
      updatedAt: this.stamp(),
    });

    return { ok: true, version: published };
  }

  async delete(tenantId: string, questionnaireId: string): Promise<boolean> {
    const detail = this.details.get(questionnaireId);
    if (!detail || detail.tenantId !== tenantId) {
      return false;
    }

    this.details.delete(questionnaireId);
    this.responses.delete(questionnaireId);
    return true;
  }

  async countResponses(tenantId: string, questionnaireId: string): Promise<number> {
    const detail = await this.findDetail(tenantId, questionnaireId);
    if (!detail) {
      return 0;
    }

    return (this.responses.get(questionnaireId) ?? []).length;
  }

  async listResponses(
    tenantId: string,
    questionnaireId: string,
    offset: number,
    limit: number,
  ): Promise<SurveyResponsePage> {
    const detail = await this.findDetail(tenantId, questionnaireId);
    if (!detail) {
      return { items: [], total: 0 };
    }

    const all = this.responses.get(questionnaireId) ?? [];
    return { items: all.slice(offset, offset + limit), total: all.length };
  }

  private findBySlug(tenantId: string, slug: string): QuestionnaireDetail | null {
    for (const detail of this.details.values()) {
      if (detail.tenantId === tenantId && detail.slug === slug) {
        return detail;
      }
    }

    return null;
  }
}

function createService(): {
  service: QuestionnaireService;
  repository: InMemoryQuestionnaireRepository;
} {
  const repository = new InMemoryQuestionnaireRepository();

  return { service: new QuestionnaireService(repository), repository };
}

function createRequest(): unknown {
  return {
    slug: 'Customer-Survey',
    defaultLanguage: 'zh-CN',
    title: { 'zh-CN': '客户满意度调查' },
    description: { 'zh-CN': '请根据实际体验作答' },
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

describe('QuestionnaireService.create', () => {
  it('创建问卷时生成空分组草稿并规范化 slug', async () => {
    const { service } = createService();

    const detail = await service.create('tenant-1', 'user-1', createRequest());

    expect(detail.slug).toBe('customer-survey');
    expect(detail.tenantId).toBe('tenant-1');
    expect(detail.status).toBe('draft');
    expect(detail.published).toBeNull();
    expect(detail.draft.content.defaultLanguage).toBe('zh-CN');
    expect(detail.draft.content.title['zh-CN']).toBe('客户满意度调查');
    expect(detail.draft.content.description?.['zh-CN']).toBe('请根据实际体验作答');
    expect(detail.draft.content.groups).toEqual([]);
  });

  it('slug 非法时返回 400 invalid_slug', async () => {
    const { service } = createService();

    const error = await capture<BadRequestException>(() =>
      service.create('tenant-1', 'user-1', { ...(createRequest() as object), slug: 'ab' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ code: 'invalid_slug' });
  });

  it('同租户 slug 重复时返回 409', async () => {
    const { service } = createService();
    await service.create('tenant-1', 'user-1', createRequest());

    const error = await capture<ConflictException>(() =>
      service.create('tenant-1', 'user-1', createRequest()),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'questionnaire_slug_taken' });
  });

  it('不同租户可以使用相同 slug', async () => {
    const { service } = createService();
    await service.create('tenant-1', 'user-1', createRequest());

    await expect(service.create('tenant-2', 'user-1', createRequest())).resolves.toMatchObject({
      slug: 'customer-survey',
      tenantId: 'tenant-2',
    });
  });

  it('缺少 title 时返回 400 invalid_request', async () => {
    const { service } = createService();

    const error = await capture<BadRequestException>(() =>
      service.create('tenant-1', 'user-1', { slug: 'survey-one', defaultLanguage: 'zh-CN' }),
    );

    expect(error.getResponse()).toMatchObject({ code: 'invalid_request' });
  });

  it('标题缺少默认语言文案时返回 400', async () => {
    const { service } = createService();

    const error = await capture<BadRequestException>(() =>
      service.create('tenant-1', 'user-1', {
        slug: 'survey-one',
        defaultLanguage: 'zh-CN',
        title: { en: 'Survey' },
      }),
    );

    expect(error.getResponse()).toMatchObject({ code: 'invalid_request' });
  });
});

describe('QuestionnaireService.list', () => {
  it('空租户返回空列表', async () => {
    const { service } = createService();

    await expect(service.list('tenant-1')).resolves.toEqual({ items: [] });
  });

  it('只返回当前租户的问卷，并按草稿更新时间倒序', async () => {
    const { service } = createService();
    const first = await service.create('tenant-1', 'user-1', {
      slug: 'survey-one',
      defaultLanguage: 'zh-CN',
      title: { 'zh-CN': '第一份' },
    });
    const second = await service.create('tenant-1', 'user-1', {
      slug: 'survey-two',
      defaultLanguage: 'zh-CN',
      title: { 'zh-CN': '第二份' },
    });
    await service.create('tenant-2', 'user-1', {
      slug: 'survey-one',
      defaultLanguage: 'zh-CN',
      title: { 'zh-CN': '其他租户' },
    });

    const list = await service.list('tenant-1');

    expect(list.items.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(list.items[0]).toMatchObject({
      slug: 'survey-two',
      status: 'draft',
      title: { 'zh-CN': '第二份' },
      defaultLanguage: 'zh-CN',
      publishedVersion: null,
      publishedAt: null,
    });
  });

  it('发布后返回最新版本号与发布时间', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());
    await service.updateDraft('tenant-1', created.id, { content: validContent() });
    await service.publish('tenant-1', created.id);

    const list = await service.list('tenant-1');

    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ status: 'published', publishedVersion: 1 });
    expect(typeof list.items[0]?.publishedAt).toBe('string');
  });
});

describe('QuestionnaireService.stats / listResponses', () => {
  it('统计返回答卷数与发布版本', async () => {
    const { service, repository } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());
    await service.updateDraft('tenant-1', created.id, { content: validContent() });
    await service.publish('tenant-1', created.id);
    repository.responses.set(created.id, [
      {
        id: 'response-1',
        version: 1,
        language: 'zh-CN',
        submittedAt: now,
        answers: { q1: '张三' },
      },
      {
        id: 'response-2',
        version: 1,
        language: 'zh-CN',
        submittedAt: now,
        answers: { q1: '李四' },
      },
    ]);

    const stats = await service.stats('tenant-1', created.id);

    expect(stats).toMatchObject({
      questionnaireId: created.id,
      responseCount: 2,
      publishedVersion: 1,
    });
    expect(typeof stats.lastPublishedAt).toBe('string');
  });

  it('统计不存在的问卷返回 404', async () => {
    const { service } = createService();

    const error = await capture<NotFoundException>(() => service.stats('tenant-1', 'missing'));

    expect(error.getResponse()).toMatchObject({ code: 'questionnaire_not_found' });
  });

  it('原始数据按页返回并收敛 pageSize', async () => {
    const { service, repository } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());
    repository.responses.set(
      created.id,
      ['张三', '李四', '王五'].map((name, index) => ({
        id: `response-${index + 1}`,
        version: 1,
        language: 'zh-CN',
        submittedAt: now,
        answers: { q1: name },
      })),
    );

    const result = await service.listResponses('tenant-1', created.id, '2', '1');

    expect(result).toMatchObject({ page: 2, pageSize: 1, total: 3 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'response-2', answers: { q1: '李四' } });
  });

  it('原始数据问卷不存在返回 404', async () => {
    const { service } = createService();

    const error = await capture<NotFoundException>(() =>
      service.listResponses('tenant-1', 'missing'),
    );

    expect(error.getResponse()).toMatchObject({ code: 'questionnaire_not_found' });
  });
});

describe('QuestionnaireService.get / updateDraft', () => {
  it('查询不存在的问卷返回 404', async () => {
    const { service } = createService();

    const error = await capture<NotFoundException>(() => service.get('tenant-1', 'missing'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({ code: 'questionnaire_not_found' });
  });

  it('覆盖保存草稿内容', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());

    const updated = await service.updateDraft('tenant-1', created.id, {
      content: validContent(),
    });

    expect(updated.draft.content.groups).toHaveLength(1);
    expect(updated.draft.content.groups[0]?.questions[0]?.id).toBe('q1');
    expect(updated.published).toBeNull();
  });

  it('编辑不存在的问卷返回 404', async () => {
    const { service } = createService();

    await expect(
      capture<NotFoundException>(() =>
        service.updateDraft('tenant-1', 'missing', { content: validContent() }),
      ),
    ).resolves.toMatchObject({ response: { code: 'questionnaire_not_found' } });
  });

  it('缺少 content 对象时返回 400', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());

    await expect(
      capture<BadRequestException>(() => service.updateDraft('tenant-1', created.id, {})),
    ).resolves.toMatchObject({ response: { code: 'invalid_request' } });
  });
});

describe('QuestionnaireService.publish', () => {
  it('空分组草稿发布时返回 400 与校验问题', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());

    const error = await capture<BadRequestException>(() => service.publish('tenant-1', created.id));

    expect(error).toBeInstanceOf(BadRequestException);
    const response = error.getResponse() as { code: string; details: { code: string }[] };
    expect(response.code).toBe('survey_invalid');
    expect(response.details.some((issue) => issue.code === 'EMPTY_SURVEY')).toBe(true);
  });

  it('发布合法草稿后返回版本元信息并固化为已发布状态', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());
    await service.updateDraft('tenant-1', created.id, { content: validContent() });

    const published = await service.publish('tenant-1', created.id);

    expect(published.version).toBe(1);
    expect(published.versionId).toBeTruthy();
    expect(published.schemaVersion).toBe(1);
    expect(Number.isFinite(Date.parse(published.publishedAt))).toBe(true);

    const detail = await service.get('tenant-1', created.id);
    expect(detail.status).toBe('published');
    expect(detail.published?.version).toBe(1);
    expect(detail.published?.content.title['zh-CN']).toBe('客户满意度调查');
  });

  it('再次发布递增版本号且历史快照不受草稿修改影响', async () => {
    const { service, repository } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());
    await service.updateDraft('tenant-1', created.id, { content: validContent('第一版') });
    await service.publish('tenant-1', created.id);

    await service.updateDraft('tenant-1', created.id, { content: validContent('第二版') });
    const second = await service.publish('tenant-1', created.id);

    expect(second.version).toBe(2);
    expect(repository.publishedHistory).toHaveLength(2);
    expect(repository.publishedHistory[0]?.content.title['zh-CN']).toBe('第一版');
    expect(repository.publishedHistory[1]?.content.title['zh-CN']).toBe('第二版');

    const detail = await service.get('tenant-1', created.id);
    expect(detail.published?.version).toBe(2);
    expect(detail.published?.content.title['zh-CN']).toBe('第二版');
  });

  it('发布不存在的问卷返回 404', async () => {
    const { service } = createService();

    await expect(
      capture<NotFoundException>(() => service.publish('tenant-1', 'missing')),
    ).resolves.toMatchObject({ response: { code: 'questionnaire_not_found' } });
  });
});

describe('QuestionnaireService.delete', () => {
  it('删除问卷后列表与详情都不再返回', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());

    await service.delete('tenant-1', created.id);

    await expect(service.list('tenant-1')).resolves.toEqual({ items: [] });
    await expect(
      capture<NotFoundException>(() => service.get('tenant-1', created.id)),
    ).resolves.toMatchObject({ response: { code: 'questionnaire_not_found' } });
  });

  it('不能删除其他租户的问卷', async () => {
    const { service } = createService();
    const created = await service.create('tenant-1', 'user-1', createRequest());

    await expect(
      capture<NotFoundException>(() => service.delete('tenant-2', created.id)),
    ).resolves.toMatchObject({ response: { code: 'questionnaire_not_found' } });
    await expect(service.get('tenant-1', created.id)).resolves.toMatchObject({
      id: created.id,
    });
  });

  it('删除不存在的问卷返回 404', async () => {
    const { service } = createService();

    await expect(
      capture<NotFoundException>(() => service.delete('tenant-1', 'missing')),
    ).resolves.toMatchObject({ response: { code: 'questionnaire_not_found' } });
  });
});

function clone<T>(value: T): T {
  return structuredClone(value);
}
