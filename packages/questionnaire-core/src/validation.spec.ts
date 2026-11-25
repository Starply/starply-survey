import { describe, expect, it } from 'vitest';

import type {
  ConditionNode,
  MultipleChoiceQuestion,
  Question,
  QuestionGroup,
  SurveyContent,
} from './types';
import { validateSurveyContent, validateSurveyDraft } from './validation';
import { createSurveyDraft } from './versioning';

const textQuestion = (id = 'q_text'): Question => ({
  id,
  type: 'text',
  title: '姓名',
  config: { maxLength: 20 },
});

const choiceQuestion = (id = 'q_choice'): Question => ({
  id,
  type: 'single_choice',
  title: '选择一项',
  config: {
    options: [
      { id: 'a', label: '选项 A' },
      { id: 'b', label: '选项 B' },
    ],
  },
});

const multiQuestion = (id = 'q_multi'): MultipleChoiceQuestion => ({
  id,
  type: 'multi_choice',
  title: '选择多项',
  config: {
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ],
    minSelections: 1,
    maxSelections: 2,
  },
});

const ratingQuestion = (id = 'q_rating'): Question => ({
  id,
  type: 'rating',
  title: '满意度',
  config: { min: 1, max: 5 },
});

const groupWith = (questions: Question[], id = 'g1'): QuestionGroup => ({ id, questions });

const surveyWith = (groups: QuestionGroup[]): SurveyContent => ({
  title: '测试问卷',
  groups,
});

const codesOf = (issues: readonly { code: string }[]): string[] => issues.map((item) => item.code);

describe('validateSurveyContent', () => {
  it('接受包含基础题型与有效逻辑的问卷', () => {
    const logicQuestion: Question = {
      ...choiceQuestion('q_logic'),
      logic: {
        visibleWhen: {
          kind: 'condition',
          sourceQuestionId: 'q_text',
          operator: 'is_answered',
        },
        jumpRules: [
          {
            when: {
              kind: 'condition',
              sourceQuestionId: 'q_rating',
              operator: 'greater_or_equal',
              value: 4,
            },
            target: { kind: 'group', groupId: 'g2' },
          },
        ],
      },
    };

    const result = validateSurveyContent(
      surveyWith([
        groupWith([textQuestion(), logicQuestion, multiQuestion(), ratingQuestion()]),
        groupWith([textQuestion('q_second')], 'g2'),
      ]),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('拒绝空问卷', () => {
    const result = validateSurveyContent(surveyWith([]));

    expect(result.valid).toBe(false);
    expect(codesOf(result.issues)).toContain('EMPTY_SURVEY');
  });

  it('拒绝空分组', () => {
    const result = validateSurveyContent(surveyWith([groupWith([])]));

    expect(codesOf(result.issues)).toContain('EMPTY_GROUP');
  });

  it('检测重复的分组 id 与题目 id', () => {
    const result = validateSurveyContent(
      surveyWith([
        groupWith([textQuestion('q_dup'), textQuestion('q_dup')]),
        groupWith([textQuestion()], 'g1'),
      ]),
    );

    expect(codesOf(result.issues)).toEqual(
      expect.arrayContaining(['DUPLICATE_QUESTION_ID', 'DUPLICATE_GROUP_ID']),
    );
  });

  it('要求问卷与题目都有标题', () => {
    const content: SurveyContent = {
      title: '   ',
      groups: [{ id: 'g1', questions: [{ ...textQuestion(), title: '' }] }],
    };

    const result = validateSurveyContent(content);

    expect(codesOf(result.issues).filter((code) => code === 'MISSING_TITLE')).toHaveLength(2);
  });

  it('拒绝未知题型', () => {
    const invalid = {
      id: 'q_matrix',
      type: 'matrix',
      title: '矩阵题',
      config: { rows: [], columns: [] },
    } as unknown as Question;

    const result = validateSurveyContent(surveyWith([groupWith([invalid])]));

    expect(codesOf(result.issues)).toContain('UNSUPPORTED_QUESTION_TYPE');
  });

  it('选择题至少需要两个选项', () => {
    const invalid = {
      id: 'q_bad',
      type: 'single_choice',
      title: '单选题',
      config: { options: [{ id: 'a', label: 'A' }] },
    } as unknown as Question;

    const result = validateSurveyContent(surveyWith([groupWith([invalid])]));

    expect(codesOf(result.issues)).toContain('INVALID_CHOICE_OPTIONS');
  });

  it('检测重复的选项 id 与 value，并给出准确路径', () => {
    const invalid = {
      id: 'q_bad',
      type: 'single_choice',
      title: '单选题',
      config: {
        options: [
          { id: 'a', label: 'A', value: 'same' },
          { id: 'a', label: 'B', value: 'same' },
        ],
      },
    } as unknown as Question;

    const result = validateSurveyContent(surveyWith([groupWith([invalid])]));
    const duplicateId = result.issues.find((item) => item.code === 'DUPLICATE_OPTION_ID');

    expect(codesOf(result.issues)).toEqual(
      expect.arrayContaining(['DUPLICATE_OPTION_ID', 'DUPLICATE_OPTION_VALUE']),
    );
    expect(duplicateId?.path).toBe('groups[0].questions[0].config.options[1].id');
  });

  it('校验多选数量范围', () => {
    const invalid = {
      ...multiQuestion(),
      config: { options: multiQuestion().config.options, minSelections: 3, maxSelections: 2 },
    } as unknown as Question;

    const result = validateSurveyContent(surveyWith([groupWith([invalid])]));

    expect(codesOf(result.issues)).toContain('INVALID_SELECTION_RANGE');
  });

  it('校验文本、数字与日期范围', () => {
    const text = {
      ...textQuestion(),
      config: { minLength: 10, maxLength: 5 },
    } as unknown as Question;
    const number = {
      id: 'q_number',
      type: 'number',
      title: '数字',
      config: { min: 10, max: 5 },
    } as unknown as Question;
    const date = {
      id: 'q_date',
      type: 'date',
      title: '日期',
      config: { min: '2026-12-01', max: '2026-01-01' },
    } as unknown as Question;
    const invalidDate = {
      id: 'q_date_bad',
      type: 'date',
      title: '日期',
      config: { min: '2026-13-01' },
    } as unknown as Question;

    const result = validateSurveyContent(
      surveyWith([groupWith([text]), groupWith([number, date, invalidDate], 'g2')]),
    );

    expect(codesOf(result.issues)).toEqual(
      expect.arrayContaining(['INVALID_TEXT_RANGE', 'INVALID_NUMBER_RANGE', 'INVALID_DATE_RANGE']),
    );
    expect(result.issues.filter((item) => item.code === 'INVALID_DATE_RANGE')).toHaveLength(2);
  });

  it('校验评分范围与标签', () => {
    const invalid = {
      id: 'q_rating',
      type: 'rating',
      title: '评分',
      config: {
        min: 5,
        max: 3,
        labels: [
          { value: 2, label: '低' },
          { value: 2, label: '重复' },
        ],
      },
    } as unknown as Question;

    const result = validateSurveyContent(surveyWith([groupWith([invalid])]));

    expect(
      codesOf(result.issues).filter((code) => code === 'INVALID_RATING_RANGE').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('检测逻辑引用不存在的题目', () => {
    const question: Question = {
      ...textQuestion(),
      logic: {
        visibleWhen: {
          kind: 'condition',
          sourceQuestionId: 'q_missing',
          operator: 'is_answered',
        },
      },
    };

    const result = validateSurveyContent(surveyWith([groupWith([question])]));

    expect(codesOf(result.issues)).toContain('UNKNOWN_QUESTION_REFERENCE');
  });

  it('拒绝空的组合条件', () => {
    const question: Question = {
      ...textQuestion(),
      logic: { visibleWhen: { kind: 'group', combinator: 'and', conditions: [] } },
    };

    const result = validateSurveyContent(surveyWith([groupWith([question])]));

    expect(codesOf(result.issues)).toContain('INVALID_LOGIC');
  });

  it('拒绝过深的条件嵌套', () => {
    let condition: ConditionNode = {
      kind: 'condition',
      sourceQuestionId: 'q_text',
      operator: 'is_answered',
    };
    for (let index = 0; index < 11; index += 1) {
      condition = { kind: 'group', combinator: 'and', conditions: [condition] };
    }

    const question: Question = {
      ...textQuestion(),
      logic: { visibleWhen: condition },
    };

    const result = validateSurveyContent(surveyWith([groupWith([question])]));

    expect(codesOf(result.issues)).toContain('LOGIC_NESTING_TOO_DEEP');
  });

  it('检测操作符与题型不匹配', () => {
    const question: Question = {
      ...textQuestion(),
      logic: {
        visibleWhen: {
          kind: 'condition',
          sourceQuestionId: 'q_text',
          operator: 'is_any_of',
          value: ['a'],
        },
      },
    };

    const result = validateSurveyContent(surveyWith([groupWith([question])]));

    expect(codesOf(result.issues)).toContain('OPERATOR_TYPE_MISMATCH');
  });

  it('检测数值比较用于文本题型', () => {
    const question: Question = {
      ...textQuestion(),
      logic: {
        visibleWhen: {
          kind: 'condition',
          sourceQuestionId: 'q_text',
          operator: 'greater_than',
          value: 3,
        },
      },
    };

    const result = validateSurveyContent(surveyWith([groupWith([question])]));

    expect(codesOf(result.issues)).toContain('OPERATOR_TYPE_MISMATCH');
  });

  it('检测跳转目标引用完整性', () => {
    const question: Question = {
      ...textQuestion(),
      logic: {
        jumpRules: [
          {
            when: { kind: 'condition', sourceQuestionId: 'q_text', operator: 'is_answered' },
            target: { kind: 'question', questionId: 'q_missing' },
          },
          {
            when: { kind: 'condition', sourceQuestionId: 'q_text', operator: 'is_answered' },
            target: { kind: 'group', groupId: 'g_missing' },
          },
        ],
      },
    };

    const result = validateSurveyContent(surveyWith([groupWith([question])]));

    expect(codesOf(result.issues)).toEqual(
      expect.arrayContaining(['UNKNOWN_QUESTION_REFERENCE', 'UNKNOWN_GROUP_REFERENCE']),
    );
  });

  it('拒绝 equals 使用数组值', () => {
    const question: Question = {
      ...multiQuestion(),
      logic: {
        visibleWhen: {
          kind: 'condition',
          sourceQuestionId: 'q_multi',
          operator: 'equals',
          value: ['a'],
        },
      },
    };

    const result = validateSurveyContent(surveyWith([groupWith([question])]));

    expect(codesOf(result.issues)).toContain('INVALID_LOGIC');
  });

  it('校验草稿时同时检查 surveyId', () => {
    const draft = createSurveyDraft({
      surveyId: '',
      title: '草稿',
      groups: [groupWith([textQuestion()])],
    });

    const result = validateSurveyDraft(draft);

    expect(result.valid).toBe(false);
    expect(codesOf(result.issues)).toContain('MISSING_ID');
  });

  it('合法草稿通过校验', () => {
    const draft = createSurveyDraft({
      surveyId: 'survey-1',
      title: '草稿',
      groups: [groupWith([textQuestion()])],
    });

    expect(validateSurveyDraft(draft).valid).toBe(true);
  });
});
