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

  async isSlugTaken(tenantId: string, slug: string): Promise<boolean> {
    return this.findBySlug(tenantId, slug) !== null;
  }

  async create(input: CreateQuestionnaireInput): Promise<QuestionnaireDetail> {
    const detail: QuestionnaireDetail = {
      id: input.id,
      tenantId: input.tenantId,
      slug: input.slug,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      draft: { id: `draft-${input.id}`, content: clone(input.content), updatedAt: now },
      published: null,
    };
    this.details.set(input.id, detail);

    return detail;
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

    const updated: QuestionnaireDetail = {
      ...detail,
      updatedAt: new Date(now.getTime() + 1_000),
      draft: {
        ...detail.draft,
        content: clone(content),
        updatedAt: new Date(now.getTime() + 1_000),
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
      updatedAt: new Date(now.getTime() + 2_000),
    });

    return { ok: true, version: published };
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

function clone<T>(value: T): T {
  return structuredClone(value);
}
