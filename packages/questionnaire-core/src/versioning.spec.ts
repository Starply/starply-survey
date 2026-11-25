import { describe, expect, it } from 'vitest';

import {
  QUESTIONNAIRE_SCHEMA_VERSION,
  type PublishedSurveyVersion,
  type SurveyDraft,
} from './types';
import { SurveyValidationError } from './validation';
import { createSurveyDraft, publishSurvey } from './versioning';

const validDraft = (): SurveyDraft =>
  createSurveyDraft({
    surveyId: 'survey-1',
    title: '客户满意度调查',
    groups: [
      {
        id: 'g1',
        title: '基本信息',
        questions: [
          { id: 'q1', type: 'text', title: '姓名', config: { maxLength: 20 } },
          {
            id: 'q2',
            type: 'rating',
            title: '满意度',
            config: { min: 1, max: 5 },
          },
        ],
      },
    ],
  });

const options = {
  versionId: 'version-1',
  version: 1,
  publishedAt: '2026-11-25T00:00:00.000Z',
};

describe('createSurveyDraft', () => {
  it('创建带 kind 标记的草稿', () => {
    const draft = createSurveyDraft({
      surveyId: 'survey-1',
      title: '问卷',
      description: '说明',
      groups: [{ id: 'g1', questions: [{ id: 'q1', type: 'text', title: '题', config: {} }] }],
    });

    expect(draft.kind).toBe('draft');
    expect(draft.surveyId).toBe('survey-1');
    expect(draft.content.description).toBe('说明');
  });
});

describe('publishSurvey', () => {
  it('发布合法草稿并写入版本元信息', () => {
    const published = publishSurvey(validDraft(), options);

    expect(published.kind).toBe('published');
    expect(published.surveyId).toBe('survey-1');
    expect(published.versionId).toBe('version-1');
    expect(published.version).toBe(1);
    expect(published.schemaVersion).toBe(QUESTIONNAIRE_SCHEMA_VERSION);
    expect(published.publishedAt).toBe(options.publishedAt);
    expect(published.content.title).toBe('客户满意度调查');
  });

  it('缺省 publishedAt 与 schemaVersion', () => {
    const published = publishSurvey(validDraft(), { versionId: 'v1', version: 2 });

    expect(published.schemaVersion).toBe(QUESTIONNAIRE_SCHEMA_VERSION);
    expect(Number.isFinite(Date.parse(published.publishedAt))).toBe(true);
  });

  it('深度冻结发布快照', () => {
    const published = publishSurvey(validDraft(), options);

    expect(Object.isFrozen(published)).toBe(true);
    expect(Object.isFrozen(published.content)).toBe(true);
    expect(Object.isFrozen(published.content.groups)).toBe(true);
    expect(Object.isFrozen(published.content.groups[0]?.questions)).toBe(true);
    expect(Object.isFrozen(published.content.groups[0]?.questions[0]?.config)).toBe(true);
  });

  it('发布后快照不受草稿后续修改影响', () => {
    const draft = validDraft();
    const published = publishSurvey(draft, options);

    draft.content.title = '修改后的标题';
    draft.content.groups[0]?.questions.push({
      id: 'q3',
      type: 'text',
      title: '新增',
      config: {},
    });

    expect(published.content.title).toBe('客户满意度调查');
    expect(published.content.groups[0]?.questions).toHaveLength(2);
  });

  it('拒绝修改已发布内容', () => {
    const published = publishSurvey(validDraft(), options);
    const mutable = published as unknown as PublishedSurveyVersion & {
      content: { title: string };
    };

    expect(() => {
      mutable.content.title = '篡改';
    }).toThrow();
  });

  it('草稿非法时抛出 SurveyValidationError', () => {
    const draft = createSurveyDraft({ surveyId: 'survey-1', title: '空问卷', groups: [] });

    expect(() => publishSurvey(draft, options)).toThrow(SurveyValidationError);

    try {
      publishSurvey(draft, options);
    } catch (error) {
      expect(error).toBeInstanceOf(SurveyValidationError);
      const issues = (error as SurveyValidationError).issues;
      expect(issues.some((item) => item.code === 'EMPTY_SURVEY')).toBe(true);
    }
  });

  it('校验版本号与 versionId', () => {
    expect(() => publishSurvey(validDraft(), { versionId: 'v1', version: 0 })).toThrow(
      SurveyValidationError,
    );
    expect(() => publishSurvey(validDraft(), { versionId: '', version: 1 })).toThrow(
      SurveyValidationError,
    );
  });

  it('拒绝非法 publishedAt', () => {
    expect(() => publishSurvey(validDraft(), { ...options, publishedAt: 'not-a-date' })).toThrow(
      SurveyValidationError,
    );
  });

  it('拒绝非草稿对象', () => {
    const draft = { ...validDraft(), kind: 'published' } as unknown as SurveyDraft;

    expect(() => publishSurvey(draft, options)).toThrow(TypeError);
  });
});
