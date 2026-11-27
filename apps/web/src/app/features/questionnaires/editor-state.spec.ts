import type { Question, SurveyContent } from '@starply/contracts';

import {
  addChoiceOption,
  addGroup,
  addQuestion,
  createQuestion,
  optionsOf,
  removeChoiceOption,
  removeGroup,
  removeQuestion,
  setGroupTitle,
  setOptionLabel,
  setQuestionRequired,
  setQuestionTitle,
} from './editor-state';

function surveyWithChoice(): SurveyContent {
  const question = createQuestion('single_choice', 'zh-CN');
  const content: SurveyContent = {
    defaultLanguage: 'zh-CN',
    title: { 'zh-CN': '满意度' },
    groups: [{ id: 'g1', title: { 'zh-CN': '第一组' }, questions: [question] }],
  };

  return content;
}

function firstQuestion(content: SurveyContent): Question {
  const question = content.groups[0]?.questions[0];
  if (!question) {
    throw new Error('测试数据缺少题目');
  }

  return question;
}

describe('createQuestion', () => {
  it('选择题自带一个选项，评分题默认 1-5', () => {
    const choice = createQuestion('multi_choice', 'en');
    expect(choice.type).toBe('multi_choice');
    expect(optionsOf(choice)).toHaveLength(1);
    expect(Object.keys(optionsOf(choice)[0]?.label ?? {})).toEqual(['en']);

    const rating = createQuestion('rating', 'zh-CN');
    expect(rating.type).toBe('rating');
    expect(rating.type === 'rating' && rating.config).toMatchObject({ min: 1, max: 5 });
  });

  it('文本题型没有选项且标题使用默认语言', () => {
    const question = createQuestion('text', 'zh-CN');

    expect(optionsOf(question)).toEqual([]);
    expect(question.title['zh-CN']).toBe('单行文本');
    expect(question.required).toBe(false);
  });
});

describe('分组编辑', () => {
  const base: SurveyContent = {
    defaultLanguage: 'zh-CN',
    title: { 'zh-CN': '问卷' },
    groups: [],
  };

  it('追加分组不修改原对象', () => {
    const next = addGroup(base);

    expect(base.groups).toHaveLength(0);
    expect(next.groups).toHaveLength(1);
    expect(next.groups[0]?.title?.['zh-CN']).toBe('未命名分组');
    expect(next.groups[0]?.questions).toEqual([]);
  });

  it('删除分组只影响目标分组', () => {
    const withTwo: SurveyContent = {
      ...base,
      groups: [
        { id: 'g1', questions: [] },
        { id: 'g2', questions: [] },
      ],
    };

    const next = removeGroup(withTwo, 'g1');

    expect(next.groups.map((group) => group.id)).toEqual(['g2']);
    expect(withTwo.groups).toHaveLength(2);
  });

  it('修改分组标题保留其他语言文案', () => {
    const content: SurveyContent = {
      ...base,
      groups: [{ id: 'g1', title: { 'zh-CN': '旧标题', en: 'Group' }, questions: [] }],
    };

    const next = setGroupTitle(content, 'g1', '新标题');

    expect(next.groups[0]?.title).toEqual({ 'zh-CN': '新标题', en: 'Group' });
  });
});

describe('题目编辑', () => {
  it('添加与删除题目', () => {
    const content = surveyWithChoice();
    const added = addQuestion(content, 'g1', createQuestion('text', 'zh-CN'));
    expect(added.groups[0]?.questions).toHaveLength(2);

    const questionId = firstQuestion(added).id;
    const removed = removeQuestion(added, 'g1', questionId);
    expect(removed.groups[0]?.questions).toHaveLength(1);
  });

  it('修改题目标题与必答标记', () => {
    const content = surveyWithChoice();
    const questionId = firstQuestion(content).id;

    const titled = setQuestionTitle(content, 'g1', questionId, '请选择最满意的选项');
    expect(firstQuestion(titled).title['zh-CN']).toBe('请选择最满意的选项');

    const required = setQuestionRequired(titled, 'g1', questionId, true);
    expect(firstQuestion(required).required).toBe(true);
    expect(firstQuestion(content).title['zh-CN']).toBe('单选题');
  });
});

describe('选项编辑', () => {
  it('增删改选项只作用于目标题目', () => {
    const content = surveyWithChoice();
    const questionId = firstQuestion(content).id;

    const added = addChoiceOption(content, 'g1', questionId);
    expect(optionsOf(firstQuestion(added))).toHaveLength(2);

    const optionId = optionsOf(firstQuestion(added))[0]?.id ?? '';
    const labelled = setOptionLabel(added, 'g1', questionId, optionId, '非常满意');
    expect(optionsOf(firstQuestion(labelled))[0]?.label['zh-CN']).toBe('非常满意');

    const removed = removeChoiceOption(labelled, 'g1', questionId, optionId);
    expect(optionsOf(firstQuestion(removed))).toHaveLength(1);
  });

  it('对非选择题的选项操作是空操作', () => {
    const content: SurveyContent = {
      defaultLanguage: 'zh-CN',
      title: { 'zh-CN': '问卷' },
      groups: [
        {
          id: 'g1',
          questions: [{ id: 'q1', type: 'text', title: { 'zh-CN': '姓名' }, config: {} }],
        },
      ],
    };

    const next = addChoiceOption(content, 'g1', 'q1');

    expect(next).toEqual(content);
    expect(optionsOf(firstQuestion(next))).toEqual([]);
  });
});
