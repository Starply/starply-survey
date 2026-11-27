import type {
  ChoiceOption,
  LanguageTag,
  LocalizedText,
  Question,
  QuestionGroup,
  QuestionType,
  SurveyContent,
} from '@starply/contracts';

import { setText } from '../../shared/text';

/** 题型的中文展示名，同时作为新建题目的默认标题。 */
export const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  text: '单行文本',
  textarea: '多行文本',
  number: '数字',
  email: '邮箱',
  date: '日期',
  single_choice: '单选题',
  multi_choice: '多选题',
  rating: '评分',
};

export const QUESTION_TYPE_OPTIONS: ReadonlyArray<{ value: QuestionType; label: string }> = (
  Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]
).map((value) => ({ value, label: QUESTION_TYPE_LABELS[value] }));

/**
 * 生成编辑器内的稳定 id。
 * 优先用 crypto.randomUUID，旧浏览器退回时间戳 + 随机串。
 */
export function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  const suffix = uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return `${prefix}-${suffix}`;
}

function createOption(language: LanguageTag): ChoiceOption {
  return { id: createId('o'), label: { [language]: '选项' } };
}

/** 按题型创建带最小合法配置的题目；选择类自带一个选项，评分默认 1-5。 */
export function createQuestion(type: QuestionType, language: LanguageTag): Question {
  const id = createId('q');
  const title: LocalizedText = { [language]: QUESTION_TYPE_LABELS[type] };

  switch (type) {
    case 'textarea':
      return { id, type, title, required: false, config: {} };
    case 'number':
      return { id, type, title, required: false, config: {} };
    case 'email':
      return { id, type, title, required: false, config: {} };
    case 'date':
      return { id, type, title, required: false, config: {} };
    case 'single_choice':
      return {
        id,
        type,
        title,
        required: false,
        config: { options: [createOption(language)] },
      };
    case 'multi_choice':
      return {
        id,
        type,
        title,
        required: false,
        config: { options: [createOption(language)] },
      };
    case 'rating':
      return { id, type, title, required: false, config: { min: 1, max: 5 } };
    case 'text':
    default:
      return { id, type: 'text', title, required: false, config: {} };
  }
}

/** 在末尾追加空分组。 */
export function addGroup(content: SurveyContent): SurveyContent {
  const group: QuestionGroup = {
    id: createId('g'),
    title: { [content.defaultLanguage]: '未命名分组' },
    questions: [],
  };

  return { ...content, groups: [...content.groups, group] };
}

export function removeGroup(content: SurveyContent, groupId: string): SurveyContent {
  return { ...content, groups: content.groups.filter((group) => group.id !== groupId) };
}

export function setGroupTitle(
  content: SurveyContent,
  groupId: string,
  title: string,
): SurveyContent {
  return mapGroup(content, groupId, (group) => ({
    ...group,
    title: setText(group.title, content.defaultLanguage, title),
  }));
}

export function addQuestion(
  content: SurveyContent,
  groupId: string,
  question: Question,
): SurveyContent {
  return mapGroup(content, groupId, (group) => ({
    ...group,
    questions: [...group.questions, question],
  }));
}

export function removeQuestion(
  content: SurveyContent,
  groupId: string,
  questionId: string,
): SurveyContent {
  return mapGroup(content, groupId, (group) => ({
    ...group,
    questions: group.questions.filter((question) => question.id !== questionId),
  }));
}

export function setQuestionTitle(
  content: SurveyContent,
  groupId: string,
  questionId: string,
  title: string,
): SurveyContent {
  return mapQuestion(content, groupId, questionId, (question) => ({
    ...question,
    title: setText(question.title, content.defaultLanguage, title),
  }));
}

export function setQuestionRequired(
  content: SurveyContent,
  groupId: string,
  questionId: string,
  required: boolean,
): SurveyContent {
  return mapQuestion(content, groupId, questionId, (question) => ({ ...question, required }));
}

export function addChoiceOption(
  content: SurveyContent,
  groupId: string,
  questionId: string,
): SurveyContent {
  return mapQuestion(content, groupId, questionId, (question) =>
    withOptions(question, (options) => [...options, createOption(content.defaultLanguage)]),
  );
}

export function setOptionLabel(
  content: SurveyContent,
  groupId: string,
  questionId: string,
  optionId: string,
  label: string,
): SurveyContent {
  return mapQuestion(content, groupId, questionId, (question) =>
    withOptions(question, (options) =>
      options.map((option) =>
        option.id === optionId
          ? { ...option, label: setText(option.label, content.defaultLanguage, label) }
          : option,
      ),
    ),
  );
}

export function removeChoiceOption(
  content: SurveyContent,
  groupId: string,
  questionId: string,
  optionId: string,
): SurveyContent {
  return mapQuestion(content, groupId, questionId, (question) =>
    withOptions(question, (options) => options.filter((option) => option.id !== optionId)),
  );
}

/** 选择题的选项；其他题型返回空数组，模板无需再做类型判断。 */
export function optionsOf(question: Question): readonly ChoiceOption[] {
  return question.type === 'single_choice' || question.type === 'multi_choice'
    ? question.config.options
    : [];
}

function mapGroup(
  content: SurveyContent,
  groupId: string,
  mapper: (group: QuestionGroup) => QuestionGroup,
): SurveyContent {
  return {
    ...content,
    groups: content.groups.map((group) => (group.id === groupId ? mapper(group) : group)),
  };
}

function mapQuestion(
  content: SurveyContent,
  groupId: string,
  questionId: string,
  mapper: (question: Question) => Question,
): SurveyContent {
  return mapGroup(content, groupId, (group) => ({
    ...group,
    questions: group.questions.map((question) =>
      question.id === questionId ? mapper(question) : question,
    ),
  }));
}

function withOptions(
  question: Question,
  updater: (options: ChoiceOption[]) => ChoiceOption[],
): Question {
  if (question.type !== 'single_choice' && question.type !== 'multi_choice') {
    return question;
  }

  return { ...question, config: { ...question.config, options: updater(question.config.options) } };
}
