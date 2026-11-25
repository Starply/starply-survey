import { describe, expect, it } from 'vitest';

import type { LocalizedText } from './localization';
import {
  QUESTIONNAIRE_SCHEMA_VERSION,
  type PublishedSurveyVersion,
  type SurveyDraft,
} from './types';
import { SurveyValidationError } from './validation';
import { createSurveyDraft, publishSurvey } from './versioning';

const zh = (text: string, en?: string): LocalizedText =>
  en === undefined ? { 'zh-CN': text } : { 'zh-CN': text, en };

const validDraft = (): SurveyDraft =>
  createSurveyDraft({
    surveyId: 'survey-1',
    defaultLanguage: 'zh-CN',
    title: zh('客户满意度调查', 'Customer satisfaction survey'),
    description: zh('请根据实际体验作答', 'Please answer based on your experience'),
    groups: [
      {
        id: 'g1',
        title: zh('基本信息', 'Basic information'),
        questions: [
          { id: 'q1', type: 'text', title: zh('姓名', 'Name'), config: { maxLength: 20 } },
          {
            id: 'q2',
            type: 'rating',
            title: zh('满意度', 'Satisfaction'),
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
  it('创建带 kind 标记与默认语言的草稿', () => {
    const draft = createSurveyDraft({
      surveyId: 'survey-1',
      defaultLanguage: 'zh-CN',
      title: zh('问卷', 'Survey'),
      description: zh('说明'),
      groups: [{ id: 'g1', questions: [{ id: 'q1', type: 'text', title: zh('题'), config: {} }] }],
    });

    expect(draft.kind).toBe('draft');
    expect(draft.surveyId).toBe('survey-1');
    expect(draft.content.defaultLanguage).toBe('zh-CN');
    expect(draft.content.description?.['zh-CN']).toBe('说明');
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
    expect(published.content.title['zh-CN']).toBe('客户满意度调查');
    expect(published.content.title['en']).toBe('Customer satisfaction survey');
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
    expect(Object.isFrozen(published.content.title)).toBe(true);
    expect(Object.isFrozen(published.content.groups)).toBe(true);
    expect(Object.isFrozen(published.content.groups[0]?.questions)).toBe(true);
    expect(Object.isFrozen(published.content.groups[0]?.questions[0]?.config)).toBe(true);
  });

  it('发布后快照不受草稿后续修改影响', () => {
    const draft = validDraft();
    const published = publishSurvey(draft, options);

    draft.content.title['zh-CN'] = '修改后的标题';
    draft.content.groups[0]?.questions.push({
      id: 'q3',
      type: 'text',
      title: zh('新增'),
      config: {},
    });

    expect(published.content.title['zh-CN']).toBe('客户满意度调查');
    expect(published.content.groups[0]?.questions).toHaveLength(2);
  });

  it('拒绝修改已发布内容', () => {
    const published = publishSurvey(validDraft(), options);
    const mutable = published as unknown as PublishedSurveyVersion & {
      content: { title: Record<string, string> };
    };

    expect(() => {
      mutable.content.title['zh-CN'] = '篡改';
    }).toThrow();
  });

  it('草稿非法时抛出 SurveyValidationError', () => {
    const draft = createSurveyDraft({
      surveyId: 'survey-1',
      defaultLanguage: 'zh-CN',
      title: zh('空问卷'),
      groups: [],
    });

    expect(() => publishSurvey(draft, options)).toThrow(SurveyValidationError);

    try {
      publishSurvey(draft, options);
    } catch (error) {
      expect(error).toBeInstanceOf(SurveyValidationError);
      const issues = (error as SurveyValidationError).issues;
      expect(issues.some((item) => item.code === 'EMPTY_SURVEY')).toBe(true);
    }
  });

  it('缺少默认语言文案时拒绝发布', () => {
    const draft = createSurveyDraft({
      surveyId: 'survey-1',
      defaultLanguage: 'zh-CN',
      title: { en: 'English only' } as unknown as LocalizedText,
      groups: [{ id: 'g1', questions: [{ id: 'q1', type: 'text', title: zh('题'), config: {} }] }],
    });

    expect(() => publishSurvey(draft, options)).toThrow(SurveyValidationError);
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
