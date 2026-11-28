import {
  type DeepReadonly,
  type ChoiceOption,
  type ReadonlySurveyContent,
  type SurveyAnswers,
  type ValidationIssue,
  type ValidationIssueCode,
  type ValidationResult,
} from './types';
import { SurveyValidationError } from './validation';

/** 与 schema 校验保持一致：日期使用 YYYY-MM-DD，避免时区歧义。 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 宽松邮箱校验：只拦截明显非邮箱的输入，最终以服务端校验为准。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ReadonlyQuestion = ReadonlySurveyContent['groups'][number]['questions'][number];
type ReadonlyChoiceOption = DeepReadonly<ChoiceOption>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  return Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

/** 未作答：缺省、null、空白字符串与空数组。数字 0 视为有效作答。 */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

/** 选项的提交值：显式 value 优先，否则用 id。 */
function optionValue(option: ReadonlyChoiceOption): string {
  return option.value ?? option.id;
}

function addIssue(
  issues: ValidationIssue[],
  code: ValidationIssueCode,
  message: string,
  path: string,
): void {
  issues.push({ code, message, path, severity: 'error' });
}

function summarize(issues: ValidationIssue[]): ValidationResult {
  return { valid: issues.length === 0, issues, errors: issues, warnings: [] };
}

function validateTextAnswer(
  value: unknown,
  config: { readonly minLength?: number; readonly maxLength?: number },
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== 'string') {
    addIssue(issues, 'INVALID_ANSWER_TYPE', '该题需要文本作答', path);
    return;
  }

  const { minLength, maxLength } = config;
  if (minLength !== undefined && value.length < minLength) {
    addIssue(issues, 'INVALID_ANSWER_LENGTH', `作答长度不能少于 ${minLength} 个字符`, path);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    addIssue(issues, 'INVALID_ANSWER_LENGTH', `作答长度不能超过 ${maxLength} 个字符`, path);
  }
}

function validateAnswer(
  question: ReadonlyQuestion,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  switch (question.type) {
    case 'text':
    case 'textarea':
      validateTextAnswer(value, question.config, path, issues);
      return;

    case 'email': {
      if (typeof value !== 'string') {
        addIssue(issues, 'INVALID_ANSWER_TYPE', '该题需要邮箱文本', path);
        return;
      }
      if (!EMAIL_PATTERN.test(value.trim())) {
        addIssue(issues, 'INVALID_ANSWER_EMAIL', '请输入合法的邮箱地址', path);
      }
      validateTextAnswer(value, question.config, path, issues);
      return;
    }

    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        addIssue(issues, 'INVALID_ANSWER_TYPE', '该题需要数字作答', path);
        return;
      }
      const { min, max, integer } = question.config;
      if (integer === true && !Number.isInteger(value)) {
        addIssue(issues, 'ANSWER_OUT_OF_RANGE', '该题需要整数作答', path);
        return;
      }
      if (min !== undefined && value < min) {
        addIssue(issues, 'ANSWER_OUT_OF_RANGE', `作答不能小于 ${min}`, path);
      }
      if (max !== undefined && value > max) {
        addIssue(issues, 'ANSWER_OUT_OF_RANGE', `作答不能大于 ${max}`, path);
      }
      return;
    }

    case 'date': {
      if (typeof value !== 'string' || !isValidDate(value)) {
        addIssue(issues, 'INVALID_ANSWER_DATE', '请输入 YYYY-MM-DD 格式的合法日期', path);
        return;
      }
      const { min, max } = question.config;
      if (min !== undefined && value < min) {
        addIssue(issues, 'ANSWER_OUT_OF_RANGE', `日期不能早于 ${min}`, path);
      }
      if (max !== undefined && value > max) {
        addIssue(issues, 'ANSWER_OUT_OF_RANGE', `日期不能晚于 ${max}`, path);
      }
      return;
    }

    case 'single_choice': {
      if (typeof value !== 'string') {
        addIssue(issues, 'INVALID_ANSWER_TYPE', '单选题需要单个选项值', path);
        return;
      }
      const allowed = new Set(question.config.options.map(optionValue));
      if (!allowed.has(value)) {
        addIssue(issues, 'INVALID_ANSWER_OPTION', '所选选项不存在', path);
      }
      return;
    }

    case 'multi_choice': {
      if (!Array.isArray(value)) {
        addIssue(issues, 'INVALID_ANSWER_TYPE', '多选题需要选项值数组', path);
        return;
      }
      if (!value.every((item): item is string => typeof item === 'string')) {
        addIssue(issues, 'INVALID_ANSWER_TYPE', '多选题的每个选项值都必须是字符串', path);
        return;
      }

      const selections = new Set(value);
      if (selections.size !== value.length) {
        addIssue(issues, 'INVALID_ANSWER_OPTION', '同一选项不能重复选择', path);
      }

      const config = question.config;
      const allowed = new Set(config.options.map(optionValue));
      for (const selection of selections) {
        if (!allowed.has(selection)) {
          addIssue(issues, 'INVALID_ANSWER_OPTION', '所选选项不存在', path);
          break;
        }
      }

      if (config.minSelections !== undefined && selections.size < config.minSelections) {
        addIssue(issues, 'INVALID_SELECTION_RANGE', `至少选择 ${config.minSelections} 项`, path);
      }
      if (config.maxSelections !== undefined && selections.size > config.maxSelections) {
        addIssue(issues, 'INVALID_SELECTION_RANGE', `最多选择 ${config.maxSelections} 项`, path);
      }

      const exclusiveSelected = config.options.some(
        (option) => option.exclusive === true && selections.has(optionValue(option)),
      );
      if (exclusiveSelected && selections.size > 1) {
        addIssue(
          issues,
          'EXCLUSIVE_OPTION_CONFLICT',
          '所选选项包含互斥项，不能与其他选项同时选择',
          path,
        );
      }
      return;
    }

    case 'rating': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        addIssue(issues, 'INVALID_ANSWER_TYPE', '评分题需要数字作答', path);
        return;
      }
      const min = question.config.min ?? 1;
      const max = question.config.max;
      if (value < min || value > max) {
        addIssue(issues, 'ANSWER_OUT_OF_RANGE', `评分必须在 ${min}-${max} 之间`, path);
      }
      return;
    }
  }
}

/**
 * 按问卷内容校验一份作答。
 * 规则覆盖：未知题目、必答、题型匹配、选项存在性、文本长度、数值/评分/日期范围、
 * 多选数量范围与互斥项。条件逻辑（visibleWhen/jumpRules）执行尚未实现，
 * 因此当前所有题目都参与必答校验。
 */
export function validateSurveyAnswers(
  content: ReadonlySurveyContent,
  answers: SurveyAnswers,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const raw: unknown = answers;
  if (!isRecord(raw)) {
    addIssue(issues, 'INVALID_ANSWER_TYPE', 'answers 必须是以题目 id 为键的对象', 'answers');
    return summarize(issues);
  }

  const questions = content.groups.flatMap((group) => group.questions);
  const questionById = new Map(questions.map((question) => [question.id, question]));

  for (const questionId of Object.keys(raw)) {
    if (!questionById.has(questionId)) {
      addIssue(
        issues,
        'UNKNOWN_ANSWER_QUESTION',
        `回答包含不存在的题目：${questionId}`,
        `answers["${questionId}"]`,
      );
    }
  }

  for (const question of questions) {
    const path = `answers["${question.id}"]`;
    const value = raw[question.id];

    if (isBlank(value)) {
      if (question.required === true) {
        addIssue(issues, 'MISSING_REQUIRED_ANSWER', '必答题未作答', path);
      }
      continue;
    }

    validateAnswer(question, value, path, issues);
  }

  return summarize(issues);
}

export function assertValidSurveyAnswers(
  content: ReadonlySurveyContent,
  answers: SurveyAnswers,
): void {
  const result = validateSurveyAnswers(content, answers);
  if (!result.valid) {
    throw new SurveyValidationError(result.errors);
  }
}
