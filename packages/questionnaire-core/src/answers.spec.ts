import { describe, expect, it } from 'vitest';

import { validateSurveyAnswers } from './answers';
import type { SurveyAnswers, SurveyContent, ValidationIssue } from './types';

const zh = (text: string) => ({ 'zh-CN': text });

function buildContent(): SurveyContent {
  return {
    defaultLanguage: 'zh-CN',
    title: zh('完整题型问卷'),
    groups: [
      {
        id: 'g1',
        questions: [
          {
            id: 'q_text',
            type: 'text',
            title: zh('姓名'),
            required: true,
            config: { minLength: 2, maxLength: 5 },
          },
          { id: 'q_textarea', type: 'textarea', title: zh('备注'), config: {} },
          { id: 'q_email', type: 'email', title: zh('邮箱'), required: true, config: {} },
          {
            id: 'q_number',
            type: 'number',
            title: zh('数量'),
            config: { min: 1, max: 10, integer: true },
          },
          {
            id: 'q_date',
            type: 'date',
            title: zh('日期'),
            config: { min: '2026-01-01', max: '2026-12-31' },
          },
          {
            id: 'q_single',
            type: 'single_choice',
            title: zh('单选'),
            config: {
              options: [
                { id: 'a', label: zh('A') },
                { id: 'b', label: zh('B'), value: 'B' },
              ],
            },
          },
          {
            id: 'q_multi',
            type: 'multi_choice',
            title: zh('多选'),
            config: {
              options: [
                { id: 'a', label: zh('A') },
                { id: 'b', label: zh('B') },
                { id: 'c', label: zh('C') },
                { id: 'd', label: zh('以上都不是'), exclusive: true },
              ],
              minSelections: 2,
              maxSelections: 3,
            },
          },
          { id: 'q_rating', type: 'rating', title: zh('满意度'), config: { min: 1, max: 5 } },
        ],
      },
    ],
  };
}

const validAnswers = (): SurveyAnswers => ({
  q_text: '张三',
  q_email: 'zhang@example.com',
  q_number: 5,
  q_date: '2026-06-01',
  q_single: 'B',
  q_multi: ['a', 'b'],
  q_rating: 4,
});

const codesOf = (issues: readonly ValidationIssue[]): string[] => issues.map((item) => item.code);

describe('validateSurveyAnswers', () => {
  it('接受覆盖全部题型的合法作答', () => {
    const result = validateSurveyAnswers(buildContent(), validAnswers());

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('必答题未作答时给出 MISSING_REQUIRED_ANSWER', () => {
    const answers = validAnswers();
    delete (answers as { q_text?: unknown }).q_text;

    const result = validateSurveyAnswers(buildContent(), answers);

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_REQUIRED_ANSWER', path: 'answers["q_text"]' }),
    );
  });

  it('必答题只填空格视为未作答', () => {
    const result = validateSurveyAnswers(buildContent(), { ...validAnswers(), q_text: '   ' });

    expect(codesOf(result.issues)).toContain('MISSING_REQUIRED_ANSWER');
  });

  it('可选题目留空不报错', () => {
    const answers = validAnswers();
    delete (answers as { q_textarea?: unknown }).q_textarea;
    delete (answers as { q_rating?: unknown }).q_rating;

    expect(validateSurveyAnswers(buildContent(), answers).valid).toBe(true);
  });

  it('拒绝未知题目', () => {
    const result = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_missing: 'x',
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'UNKNOWN_ANSWER_QUESTION', path: 'answers["q_missing"]' }),
    );
  });

  it('answers 不是对象时报 INVALID_ANSWER_TYPE', () => {
    const result = validateSurveyAnswers(buildContent(), [] as unknown as SurveyAnswers);

    expect(codesOf(result.issues)).toContain('INVALID_ANSWER_TYPE');
  });

  it('校验文本长度', () => {
    const result = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_text: '张',
    });

    expect(codesOf(result.issues)).toContain('INVALID_ANSWER_LENGTH');
  });

  it('校验邮箱格式', () => {
    const result = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_email: 'not-an-email',
    });

    expect(codesOf(result.issues)).toContain('INVALID_ANSWER_EMAIL');
  });

  it('题型不匹配时报 INVALID_ANSWER_TYPE', () => {
    const result = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_number: '5',
    });

    expect(codesOf(result.issues)).toContain('INVALID_ANSWER_TYPE');
  });

  it('校验数字范围与整数约束', () => {
    const outOfRange = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_number: 11,
    });
    const notInteger = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_number: 2.5,
    });

    expect(codesOf(outOfRange.issues)).toContain('ANSWER_OUT_OF_RANGE');
    expect(codesOf(notInteger.issues)).toContain('ANSWER_OUT_OF_RANGE');
  });

  it('校验日期格式与范围', () => {
    const invalidFormat = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_date: '2026/06/01',
    });
    const outOfRange = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_date: '2027-01-01',
    });

    expect(codesOf(invalidFormat.issues)).toContain('INVALID_ANSWER_DATE');
    expect(codesOf(outOfRange.issues)).toContain('ANSWER_OUT_OF_RANGE');
  });

  it('单选支持选项 id 与显式 value，并拒绝不存在的选项', () => {
    const byId = validateSurveyAnswers(buildContent(), { ...validAnswers(), q_single: 'a' });
    const byValue = validateSurveyAnswers(buildContent(), { ...validAnswers(), q_single: 'B' });
    const invalid = validateSurveyAnswers(buildContent(), { ...validAnswers(), q_single: 'z' });

    expect(byId.valid).toBe(true);
    expect(byValue.valid).toBe(true);
    expect(codesOf(invalid.issues)).toContain('INVALID_ANSWER_OPTION');
  });

  it('多选校验数量范围与互斥项', () => {
    const tooFew = validateSurveyAnswers(buildContent(), { ...validAnswers(), q_multi: ['a'] });
    const tooMany = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_multi: ['a', 'b', 'c', 'd'],
    });
    const conflict = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_multi: ['a', 'd'],
    });
    const unknown = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_multi: ['a', 'z'],
    });

    expect(codesOf(tooFew.issues)).toContain('INVALID_SELECTION_RANGE');
    expect(codesOf(tooMany.issues)).toContain('INVALID_SELECTION_RANGE');
    expect(codesOf(conflict.issues)).toContain('EXCLUSIVE_OPTION_CONFLICT');
    expect(codesOf(unknown.issues)).toContain('INVALID_ANSWER_OPTION');
  });

  it('多选拒绝重复选择', () => {
    const result = validateSurveyAnswers(buildContent(), {
      ...validAnswers(),
      q_multi: ['a', 'a'],
    });

    expect(codesOf(result.issues)).toContain('INVALID_ANSWER_OPTION');
  });

  it('校验评分范围', () => {
    const result = validateSurveyAnswers(buildContent(), { ...validAnswers(), q_rating: 6 });

    expect(codesOf(result.issues)).toContain('ANSWER_OUT_OF_RANGE');
  });
});
