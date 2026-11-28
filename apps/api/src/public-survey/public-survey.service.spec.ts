import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ReadonlySurveyContent, SurveyContent } from '@starply/questionnaire-core';
import { describe, expect, it } from 'vitest';

import { PublicSurveyService } from './public-survey.service';
import {
  SurveyResponseRepository,
  type CreateSurveyResponseInput,
  type PublicQuestionnaireLookup,
  type SurveyResponseRecord,
} from './survey-response.repository';

const now = new Date('2026-11-28T08:00:00.000Z');

const content = (): SurveyContent => ({
  defaultLanguage: 'zh-CN',
  title: { 'zh-CN': '客户满意度调查' },
  groups: [
    {
      id: 'g1',
      questions: [
        { id: 'q_name', type: 'text', title: { 'zh-CN': '姓名' }, required: true, config: {} },
        {
          id: 'q_score',
          type: 'rating',
          title: { 'zh-CN': '满意度' },
          config: { min: 1, max: 5 },
        },
      ],
    },
  ],
});

class InMemorySurveyResponseRepository extends SurveyResponseRepository {
  lookup: PublicQuestionnaireLookup = publishedLookup();
  readonly created: CreateSurveyResponseInput[] = [];
  private clock = 0;

  async findPublishedQuestionnaire(): Promise<PublicQuestionnaireLookup> {
    return this.lookup;
  }

  async create(input: CreateSurveyResponseInput): Promise<SurveyResponseRecord> {
    this.created.push(input);
    this.clock += 1;
    return { id: `resp-${this.clock}`, submittedAt: new Date(now.getTime() + this.clock * 1_000) };
  }
}

function publishedLookup(
  overrides: Partial<{
    content: ReadonlySurveyContent;
    version: number;
  }> = {},
): PublicQuestionnaireLookup {
  return {
    ok: true,
    snapshot: {
      tenantId: 'tenant-1',
      tenantSlug: 'acme',
      questionnaireId: 'survey-1',
      questionnaireVersionId: 'version-1',
      slug: 'nps-2026',
      version: overrides.version ?? 3,
      schemaVersion: 1,
      publishedAt: now,
      content: overrides.content ?? content(),
    },
  };
}

function createService(): {
  service: PublicSurveyService;
  repository: InMemorySurveyResponseRepository;
} {
  const repository = new InMemorySurveyResponseRepository();

  return { service: new PublicSurveyService(repository), repository };
}

async function capture<T>(action: () => Promise<unknown>): Promise<T> {
  return action().then(
    () => {
      throw new Error('预期抛出异常');
    },
    (error: unknown) => error as T,
  );
}

describe('PublicSurveyService.getPublished', () => {
  it('返回已发布版本内容与元信息', async () => {
    const { service } = createService();

    const result = await service.getPublished('acme', 'survey-1');

    expect(result).toMatchObject({
      questionnaireId: 'survey-1',
      tenantSlug: 'acme',
      slug: 'nps-2026',
      version: 3,
      schemaVersion: 1,
    });
    expect(result.publishedAt).toBe(now.toISOString());
    expect(result.content.groups[0]?.questions[0]?.id).toBe('q_name');
  });

  it('未发布时返回 404 questionnaire_not_published', async () => {
    const { service, repository } = createService();
    repository.lookup = { ok: false, reason: 'not_published' };

    const error = await capture<NotFoundException>(() => service.getPublished('acme', 'survey-1'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({ code: 'questionnaire_not_published' });
  });

  it('租户不存在时返回 404', async () => {
    const { service, repository } = createService();
    repository.lookup = { ok: false, reason: 'tenant_not_found' };

    const error = await capture<NotFoundException>(() =>
      service.getPublished('missing', 'survey-1'),
    );

    expect(error.getResponse()).toMatchObject({ code: 'tenant_not_found' });
  });

  it('租户停用时返回 403', async () => {
    const { service, repository } = createService();
    repository.lookup = { ok: false, reason: 'tenant_inactive' };

    const error = await capture<ForbiddenException>(() => service.getPublished('acme', 'survey-1'));

    expect(error.getResponse()).toMatchObject({ code: 'tenant_inactive' });
  });
});

describe('PublicSurveyService.submit', () => {
  const validBody = (): unknown => ({
    answers: { q_name: '张三', q_score: 5 },
    language: 'zh-CN',
  });

  it('校验通过后按当前版本落库并返回提交信息', async () => {
    const { service, repository } = createService();

    const result = await service.submit('acme', 'survey-1', validBody());

    expect(result.responseId).toBe('resp-1');
    expect(result.submittedAt).toBe(new Date(now.getTime() + 1_000).toISOString());
    expect(repository.created).toEqual([
      {
        tenantId: 'tenant-1',
        questionnaireId: 'survey-1',
        questionnaireVersionId: 'version-1',
        version: 3,
        language: 'zh-CN',
        answers: { q_name: '张三', q_score: 5 },
      },
    ]);
  });

  it('未提供 language 时落库为 null', async () => {
    const { service, repository } = createService();

    await service.submit('acme', 'survey-1', { answers: { q_name: '张三' } });

    expect(repository.created[0]?.language).toBeNull();
  });

  it('必答题缺失时返回 400 answers_invalid 且不落库', async () => {
    const { service, repository } = createService();

    const error = await capture<BadRequestException>(() =>
      service.submit('acme', 'survey-1', { answers: { q_score: 4 } }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    const response = error.getResponse() as {
      code: string;
      details: { code: string; path: string }[];
    };
    expect(response.code).toBe('answers_invalid');
    expect(response.details).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_ANSWER', path: 'answers["q_name"]' }),
    );
    expect(repository.created).toHaveLength(0);
  });

  it('未知题目时返回 400 answers_invalid', async () => {
    const { service } = createService();

    const error = await capture<BadRequestException>(() =>
      service.submit('acme', 'survey-1', {
        answers: { q_name: '张三', q_unknown: 'x' },
      }),
    );

    expect(error.getResponse()).toMatchObject({ code: 'answers_invalid' });
  });

  it('answers 不是对象时返回 400 invalid_request', async () => {
    const { service } = createService();

    const error = await capture<BadRequestException>(() =>
      service.submit('acme', 'survey-1', { answers: 'oops' }),
    );

    expect(error.getResponse()).toMatchObject({ code: 'invalid_request' });
  });

  it('请求体不是对象时返回 400 invalid_request', async () => {
    const { service } = createService();

    const error = await capture<BadRequestException>(() => service.submit('acme', 'survey-1', []));

    expect(error.getResponse()).toMatchObject({ code: 'invalid_request' });
  });

  it('language 非法时返回 400 invalid_request', async () => {
    const { service } = createService();

    const error = await capture<BadRequestException>(() =>
      service.submit('acme', 'survey-1', {
        answers: { q_name: '张三' },
        language: 'zh_CN',
      }),
    );

    expect(error.getResponse()).toMatchObject({ code: 'invalid_request' });
  });

  it('问卷未发布时提交返回 404', async () => {
    const { service, repository } = createService();
    repository.lookup = { ok: false, reason: 'not_published' };

    const error = await capture<NotFoundException>(() =>
      service.submit('acme', 'survey-1', validBody()),
    );

    expect(error.getResponse()).toMatchObject({ code: 'questionnaire_not_published' });
    expect(repository.created).toHaveLength(0);
  });

  it('多次提交生成不同回答 id', async () => {
    const { service } = createService();

    const first = await service.submit('acme', 'survey-1', validBody());
    const second = await service.submit('acme', 'survey-1', validBody());

    expect(first.responseId).not.toBe(second.responseId);
  });
});
