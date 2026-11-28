import type { SurveyAnswers, SurveyContent } from '@starply/questionnaire-core';
import { describe, expect, it } from 'vitest';

import { buildQuestionStats } from './question-stats';

const content: SurveyContent = {
  defaultLanguage: 'zh-CN',
  title: { 'zh-CN': '统计测试' },
  groups: [
    {
      id: 'g1',
      questions: [
        {
          id: 'single',
          type: 'single_choice',
          title: { 'zh-CN': '满意度' },
          config: {
            options: [
              { id: 'o1', label: { 'zh-CN': '满意' } },
              { id: 'o2', label: { 'zh-CN': '一般' } },
            ],
          },
        },
        {
          id: 'multi',
          type: 'multi_choice',
          title: { 'zh-CN': '使用功能' },
          config: {
            options: [
              { id: 'a', label: { 'zh-CN': '问卷' } },
              { id: 'b', label: { 'zh-CN': '题库' } },
            ],
          },
        },
        {
          id: 'rating',
          type: 'rating',
          title: { 'zh-CN': '推荐意愿' },
          config: { max: 5 },
        },
        {
          id: 'text',
          type: 'text',
          title: { 'zh-CN': '建议' },
          config: {},
        },
      ],
    },
  ],
};

const responses: SurveyAnswers[] = [
  { single: 'o1', multi: ['a', 'b'], rating: 5, text: '很好' },
  { single: 'o2', multi: ['a'], rating: 3, text: '' },
  { single: 'o1', multi: [], rating: 5 },
];

describe('buildQuestionStats', () => {
  it('未发布内容返回空统计', () => {
    expect(buildQuestionStats(null, responses)).toEqual([]);
  });

  it('选择题按选项聚合并保留零值桶', () => {
    const stats = buildQuestionStats(content, responses);
    const single = stats.find((item) => item.questionId === 'single');
    const multi = stats.find((item) => item.questionId === 'multi');

    expect(single).toMatchObject({ answeredCount: 3, type: 'single_choice' });
    expect(single?.buckets).toEqual([
      { value: 'o1', label: { 'zh-CN': '满意' }, count: 2 },
      { value: 'o2', label: { 'zh-CN': '一般' }, count: 1 },
    ]);
    expect(multi).toMatchObject({ answeredCount: 2, type: 'multi_choice' });
    expect(multi?.buckets).toEqual([
      { value: 'a', label: { 'zh-CN': '问卷' }, count: 2 },
      { value: 'b', label: { 'zh-CN': '题库' }, count: 1 },
    ]);
  });

  it('评分题按分值分布，文本题只统计作答数', () => {
    const stats = buildQuestionStats(content, responses);
    const rating = stats.find((item) => item.questionId === 'rating');
    const text = stats.find((item) => item.questionId === 'text');

    expect(rating).toMatchObject({ answeredCount: 3, type: 'rating' });
    expect(rating?.buckets).toEqual([
      { value: '1', label: { 'zh-CN': '1' }, count: 0 },
      { value: '2', label: { 'zh-CN': '2' }, count: 0 },
      { value: '3', label: { 'zh-CN': '3' }, count: 1 },
      { value: '4', label: { 'zh-CN': '4' }, count: 0 },
      { value: '5', label: { 'zh-CN': '5' }, count: 2 },
    ]);
    expect(text).toMatchObject({ answeredCount: 1, type: 'text', buckets: [] });
  });
});
