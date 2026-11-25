import { isValidLanguageTag, resolveLocalizedText, type LocalizedText } from './localization';
import {
  isConditionOperator,
  isQuestionType,
  type ReadonlySurveyContent,
  type SurveyDraft,
  type ValidationIssue,
  type ValidationIssueCode,
  type ValidationIssueSeverity,
  type ValidationResult,
} from './types';

/** 条件嵌套上限，避免异常数据或运行时环导致遍历失控。 */
export const MAX_CONDITION_DEPTH = 10;

const NUMERIC_OPERATORS = new Set([
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
]);

const MEMBERSHIP_OPERATORS = new Set(['is_any_of', 'is_none_of']);

const CONTAINS_OPERATORS = new Set(['contains', 'not_contains']);

const CONTAINS_QUESTION_TYPES = new Set(['text', 'textarea', 'email', 'multi_choice']);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class SurveyValidationError extends Error {
  constructor(readonly issues: readonly ValidationIssue[]) {
    const errorCount = issues.filter((item) => item.severity === 'error').length;
    super(`问卷 schema 校验失败：${errorCount} 个错误`);
    this.name = 'SurveyValidationError';
  }
}

interface LogicContext {
  questionTypes: ReadonlyMap<string, string>;
  questionIds: ReadonlySet<string>;
  groupIds: ReadonlySet<string>;
}

interface LogicEntry {
  logic: unknown;
  path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(
  issues: ValidationIssue[],
  code: ValidationIssueCode,
  message: string,
  path: string,
  severity: ValidationIssueSeverity = 'error',
): void {
  issues.push({ code, message, path, severity });
}

function summarize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((item) => item.severity === 'error');
  const warnings = issues.filter((item) => item.severity === 'warning');
  return { valid: errors.length === 0, issues, errors, warnings };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp);
}

function readId(
  record: Record<string, unknown>,
  key: 'id' | 'sourceQuestionId',
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = record[key];
  if (!isNonEmptyString(value)) {
    addIssue(issues, 'MISSING_ID', `${key} 必须是非空字符串`, `${path}.${key}`);
    return undefined;
  }
  return value;
}

/**
 * 校验按语言键索引的文案对象。
 * 默认语言缺失或为空视为错误，因为回退后仍拿不到文案。
 */
function validateLocalizedText(
  value: unknown,
  path: string,
  defaultLanguage: string | undefined,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, 'INVALID_LOCALIZED_TEXT', '多语言文本必须是按语言键索引的对象', path);
    return;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    addIssue(issues, 'EMPTY_LOCALIZED_TEXT', '多语言文本至少需要一个语言版本', path);
    return;
  }

  for (const [language, text] of entries) {
    if (!isValidLanguageTag(language)) {
      addIssue(
        issues,
        'INVALID_LANGUAGE_TAG',
        `语言键不合法：${language}`,
        `${path}["${language}"]`,
      );
    }
    if (typeof text !== 'string') {
      addIssue(issues, 'INVALID_LOCALIZED_TEXT', '文案必须是字符串', `${path}["${language}"]`);
    } else if (text.trim().length === 0) {
      addIssue(
        issues,
        'EMPTY_LOCALIZED_TEXT',
        `语言 ${language} 的文案不能为空`,
        `${path}["${language}"]`,
      );
    }
  }

  if (defaultLanguage && isValidLanguageTag(defaultLanguage)) {
    const fallback = resolveLocalizedText(value as LocalizedText, defaultLanguage, defaultLanguage);
    if (!fallback) {
      addIssue(
        issues,
        'MISSING_DEFAULT_LANGUAGE_TEXT',
        `缺少默认语言 ${defaultLanguage} 的文案`,
        `${path}["${defaultLanguage}"]`,
      );
    }
  }
}

function validateOptions(
  config: Record<string, unknown>,
  path: string,
  defaultLanguage: string | undefined,
  issues: ValidationIssue[],
): number {
  const options = config['options'];
  if (!Array.isArray(options)) {
    addIssue(issues, 'INVALID_CHOICE_OPTIONS', '选项必须是数组', `${path}.options`);
    return 0;
  }
  if (options.length < 2) {
    addIssue(issues, 'INVALID_CHOICE_OPTIONS', '选择题至少需要 2 个选项', `${path}.options`);
  }

  const optionIds = new Set<string>();
  const optionValues = new Set<string>();

  options.forEach((option, index) => {
    const optionPath = `${path}.options[${index}]`;
    if (!isRecord(option)) {
      addIssue(issues, 'INVALID_CHOICE_OPTIONS', '选项必须是对象', optionPath);
      return;
    }

    const id = readId(option, 'id', optionPath, issues);
    if (id) {
      if (optionIds.has(id)) {
        addIssue(issues, 'DUPLICATE_OPTION_ID', `选项 id 重复：${id}`, `${optionPath}.id`);
      }
      optionIds.add(id);
    }

    if (option['label'] === undefined) {
      addIssue(issues, 'INVALID_CHOICE_OPTIONS', '选项 label 不能为空', `${optionPath}.label`);
    } else {
      validateLocalizedText(option['label'], `${optionPath}.label`, defaultLanguage, issues);
    }

    const value = option['value'];
    if (value !== undefined) {
      if (typeof value !== 'string') {
        addIssue(
          issues,
          'INVALID_CHOICE_OPTIONS',
          '选项 value 必须是字符串',
          `${optionPath}.value`,
        );
      } else {
        if (optionValues.has(value)) {
          addIssue(
            issues,
            'DUPLICATE_OPTION_VALUE',
            `选项 value 重复：${value}`,
            `${optionPath}.value`,
          );
        }
        optionValues.add(value);
      }
    }

    if (option['exclusive'] !== undefined && typeof option['exclusive'] !== 'boolean') {
      addIssue(
        issues,
        'INVALID_CHOICE_OPTIONS',
        '选项 exclusive 必须是布尔值',
        `${optionPath}.exclusive`,
      );
    }
  });

  return options.length;
}

function validateTextConfig(
  config: Record<string, unknown>,
  path: string,
  defaultLanguage: string | undefined,
  issues: ValidationIssue[],
): void {
  const min = config['minLength'];
  const max = config['maxLength'];

  if (min !== undefined && (!isInteger(min) || min < 0)) {
    addIssue(issues, 'INVALID_TEXT_RANGE', 'minLength 必须是非负整数', `${path}.minLength`);
  }
  if (max !== undefined && (!isInteger(max) || max < 0)) {
    addIssue(issues, 'INVALID_TEXT_RANGE', 'maxLength 必须是非负整数', `${path}.maxLength`);
  }
  if (isInteger(min) && isInteger(max) && min > max) {
    addIssue(issues, 'INVALID_TEXT_RANGE', 'minLength 不能大于 maxLength', path);
  }
  if (config['placeholder'] !== undefined) {
    validateLocalizedText(config['placeholder'], `${path}.placeholder`, defaultLanguage, issues);
  }
}

function validateNumberConfig(
  config: Record<string, unknown>,
  path: string,
  defaultLanguage: string | undefined,
  issues: ValidationIssue[],
): void {
  const min = config['min'];
  const max = config['max'];
  const step = config['step'];

  if (min !== undefined && !isFiniteNumber(min)) {
    addIssue(issues, 'INVALID_NUMBER_RANGE', 'min 必须是有限数字', `${path}.min`);
  }
  if (max !== undefined && !isFiniteNumber(max)) {
    addIssue(issues, 'INVALID_NUMBER_RANGE', 'max 必须是有限数字', `${path}.max`);
  }
  if (isFiniteNumber(min) && isFiniteNumber(max) && min > max) {
    addIssue(issues, 'INVALID_NUMBER_RANGE', 'min 不能大于 max', path);
  }
  if (step !== undefined && (!isFiniteNumber(step) || step <= 0)) {
    addIssue(issues, 'INVALID_NUMBER_RANGE', 'step 必须是大于 0 的数字', `${path}.step`);
  }
  if (config['placeholder'] !== undefined) {
    validateLocalizedText(config['placeholder'], `${path}.placeholder`, defaultLanguage, issues);
  }
}

function validateDateConfig(
  config: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  const min = config['min'];
  const max = config['max'];

  if (min !== undefined && !isValidDate(min)) {
    addIssue(issues, 'INVALID_DATE_RANGE', 'min 必须是 YYYY-MM-DD 格式的合法日期', `${path}.min`);
  }
  if (max !== undefined && !isValidDate(max)) {
    addIssue(issues, 'INVALID_DATE_RANGE', 'max 必须是 YYYY-MM-DD 格式的合法日期', `${path}.max`);
  }
  if (isValidDate(min) && isValidDate(max) && min > max) {
    addIssue(issues, 'INVALID_DATE_RANGE', 'min 不能晚于 max', path);
  }
}

function validateRatingConfig(
  config: Record<string, unknown>,
  path: string,
  defaultLanguage: string | undefined,
  issues: ValidationIssue[],
): void {
  const min = config['min'] ?? 1;
  const max = config['max'];
  const step = config['step'] ?? 1;

  if (!isInteger(max) || max < 2) {
    addIssue(issues, 'INVALID_RATING_RANGE', 'max 必须是不小于 2 的整数', `${path}.max`);
  }
  if (!isInteger(min) || min < 0) {
    addIssue(issues, 'INVALID_RATING_RANGE', 'min 必须是非负整数', `${path}.min`);
  }
  if (isInteger(min) && isInteger(max) && min >= max) {
    addIssue(issues, 'INVALID_RATING_RANGE', 'min 必须小于 max', path);
  }
  if (!isFiniteNumber(step) || step <= 0) {
    addIssue(issues, 'INVALID_RATING_RANGE', 'step 必须是大于 0 的数字', `${path}.step`);
  }

  const labels = config['labels'];
  if (labels === undefined) {
    return;
  }
  if (!Array.isArray(labels)) {
    addIssue(issues, 'INVALID_RATING_RANGE', 'labels 必须是数组', `${path}.labels`);
    return;
  }

  const seen = new Set<number>();
  labels.forEach((label, index) => {
    const labelPath = `${path}.labels[${index}]`;
    if (!isRecord(label)) {
      addIssue(issues, 'INVALID_RATING_RANGE', '评分标签必须是对象', labelPath);
      return;
    }
    const value = label['value'];
    if (!isInteger(value) || (isInteger(min) && value < min) || (isInteger(max) && value > max)) {
      addIssue(
        issues,
        'INVALID_RATING_RANGE',
        '评分标签 value 必须是范围内的整数',
        `${labelPath}.value`,
      );
    } else if (seen.has(value)) {
      addIssue(
        issues,
        'INVALID_RATING_RANGE',
        `评分标签 value 重复：${value}`,
        `${labelPath}.value`,
      );
    } else {
      seen.add(value);
    }
    if (label['label'] === undefined) {
      addIssue(issues, 'INVALID_RATING_RANGE', '评分标签 label 不能为空', `${labelPath}.label`);
    } else {
      validateLocalizedText(label['label'], `${labelPath}.label`, defaultLanguage, issues);
    }
  });
}

function validateSelectionRange(
  config: Record<string, unknown>,
  optionCount: number,
  path: string,
  issues: ValidationIssue[],
): void {
  const min = config['minSelections'];
  const max = config['maxSelections'];

  if (min !== undefined && (!isInteger(min) || min < 0)) {
    addIssue(
      issues,
      'INVALID_SELECTION_RANGE',
      'minSelections 必须是非负整数',
      `${path}.minSelections`,
    );
  }
  if (max !== undefined && (!isInteger(max) || max < 0)) {
    addIssue(
      issues,
      'INVALID_SELECTION_RANGE',
      'maxSelections 必须是非负整数',
      `${path}.maxSelections`,
    );
  }
  if (isInteger(min) && min > optionCount) {
    addIssue(
      issues,
      'INVALID_SELECTION_RANGE',
      'minSelections 不能大于选项数量',
      `${path}.minSelections`,
    );
  }
  if (isInteger(max) && max > optionCount) {
    addIssue(
      issues,
      'INVALID_SELECTION_RANGE',
      'maxSelections 不能大于选项数量',
      `${path}.maxSelections`,
    );
  }
  if (isInteger(min) && isInteger(max) && min > max) {
    addIssue(issues, 'INVALID_SELECTION_RANGE', 'minSelections 不能大于 maxSelections', path);
  }
}

function validateQuestionConfig(
  type: string,
  config: Record<string, unknown>,
  path: string,
  defaultLanguage: string | undefined,
  issues: ValidationIssue[],
): void {
  switch (type) {
    case 'text':
    case 'email':
      validateTextConfig(config, path, defaultLanguage, issues);
      break;
    case 'textarea': {
      validateTextConfig(config, path, defaultLanguage, issues);
      const rows = config['rows'];
      if (rows !== undefined && (!isInteger(rows) || rows <= 0)) {
        addIssue(issues, 'INVALID_TEXT_RANGE', 'rows 必须是正整数', `${path}.rows`);
      }
      break;
    }
    case 'number':
      validateNumberConfig(config, path, defaultLanguage, issues);
      break;
    case 'date':
      validateDateConfig(config, path, issues);
      break;
    case 'single_choice':
      validateOptions(config, path, defaultLanguage, issues);
      break;
    case 'multi_choice': {
      const optionCount = validateOptions(config, path, defaultLanguage, issues);
      validateSelectionRange(config, optionCount, path, issues);
      break;
    }
    case 'rating':
      validateRatingConfig(config, path, defaultLanguage, issues);
      break;
    default:
      break;
  }
}

function validateCondition(
  node: unknown,
  path: string,
  context: LogicContext,
  issues: ValidationIssue[],
  depth: number,
): void {
  if (depth > MAX_CONDITION_DEPTH) {
    addIssue(issues, 'LOGIC_NESTING_TOO_DEEP', `条件嵌套不能超过 ${MAX_CONDITION_DEPTH} 层`, path);
    return;
  }
  if (!isRecord(node)) {
    addIssue(issues, 'INVALID_LOGIC', '条件必须是对象', path);
    return;
  }

  const kind = node['kind'];
  if (kind === 'group') {
    const combinator = node['combinator'];
    if (combinator !== 'and' && combinator !== 'or') {
      addIssue(
        issues,
        'INVALID_LOGIC',
        '组合条件的 combinator 必须是 and 或 or',
        `${path}.combinator`,
      );
    }
    const conditions = node['conditions'];
    if (!Array.isArray(conditions) || conditions.length === 0) {
      addIssue(issues, 'INVALID_LOGIC', '组合条件至少需要一个子条件', `${path}.conditions`);
      return;
    }
    conditions.forEach((child, index) =>
      validateCondition(child, `${path}.conditions[${index}]`, context, issues, depth + 1),
    );
    return;
  }

  if (kind !== 'condition') {
    addIssue(issues, 'INVALID_LOGIC', '条件节点的 kind 必须是 condition 或 group', `${path}.kind`);
    return;
  }

  const sourceQuestionId = node['sourceQuestionId'];
  const operator = node['operator'];
  if (!isNonEmptyString(sourceQuestionId)) {
    addIssue(issues, 'INVALID_LOGIC', 'sourceQuestionId 不能为空', `${path}.sourceQuestionId`);
    return;
  }
  if (!isConditionOperator(operator)) {
    addIssue(issues, 'INVALID_LOGIC', 'operator 不是支持的条件操作符', `${path}.operator`);
    return;
  }

  const sourceType = context.questionTypes.get(sourceQuestionId);
  if (!sourceType) {
    addIssue(
      issues,
      'UNKNOWN_QUESTION_REFERENCE',
      `条件引用了不存在的题目：${sourceQuestionId}`,
      `${path}.sourceQuestionId`,
    );
  }

  const value = node['value'];
  if (operator !== 'is_answered' && operator !== 'is_not_answered' && value === undefined) {
    addIssue(issues, 'INVALID_LOGIC', `操作符 ${operator} 必须提供 value`, `${path}.value`);
    return;
  }

  if (MEMBERSHIP_OPERATORS.has(operator)) {
    if (!Array.isArray(value) || value.length === 0) {
      addIssue(issues, 'INVALID_LOGIC', `${operator} 的 value 必须是非空数组`, `${path}.value`);
    }
    if (sourceType && sourceType !== 'single_choice' && sourceType !== 'multi_choice') {
      addIssue(issues, 'OPERATOR_TYPE_MISMATCH', `${operator} 只能用于选择题`, `${path}.operator`);
    }
  }

  if (NUMERIC_OPERATORS.has(operator)) {
    if (!isFiniteNumber(value)) {
      addIssue(issues, 'INVALID_LOGIC', `${operator} 的 value 必须是数字`, `${path}.value`);
    }
    if (sourceType && sourceType !== 'number' && sourceType !== 'rating') {
      addIssue(
        issues,
        'OPERATOR_TYPE_MISMATCH',
        `${operator} 只能用于数字或评分题`,
        `${path}.operator`,
      );
    }
  }

  if (CONTAINS_OPERATORS.has(operator) && sourceType) {
    if (!CONTAINS_QUESTION_TYPES.has(sourceType)) {
      addIssue(issues, 'OPERATOR_TYPE_MISMATCH', `${operator} 不能用于该题型`, `${path}.operator`);
    }
  }

  if ((operator === 'equals' || operator === 'not_equals') && Array.isArray(value)) {
    addIssue(
      issues,
      'INVALID_LOGIC',
      `${operator} 的 value 必须是单值；多选请使用 is_any_of / is_none_of`,
      `${path}.value`,
    );
  }
}

function validateJumpTarget(
  target: unknown,
  path: string,
  context: LogicContext,
  issues: ValidationIssue[],
): void {
  if (!isRecord(target)) {
    addIssue(issues, 'INVALID_LOGIC', '跳转目标必须是对象', path);
    return;
  }
  const kind = target['kind'];
  if (kind === 'question') {
    const questionId = target['questionId'];
    if (!isNonEmptyString(questionId) || !context.questionIds.has(questionId)) {
      addIssue(
        issues,
        'UNKNOWN_QUESTION_REFERENCE',
        '跳转目标引用了不存在的题目',
        `${path}.questionId`,
      );
    }
    return;
  }
  if (kind === 'group') {
    const groupId = target['groupId'];
    if (!isNonEmptyString(groupId) || !context.groupIds.has(groupId)) {
      addIssue(issues, 'UNKNOWN_GROUP_REFERENCE', '跳转目标引用了不存在的分组', `${path}.groupId`);
    }
    return;
  }
  if (kind !== 'end') {
    addIssue(
      issues,
      'INVALID_LOGIC',
      '跳转目标的 kind 必须是 question、group 或 end',
      `${path}.kind`,
    );
  }
}

function validateLogic(
  logic: unknown,
  path: string,
  context: LogicContext,
  issues: ValidationIssue[],
): void {
  if (!isRecord(logic)) {
    addIssue(issues, 'INVALID_LOGIC', 'logic 必须是对象', path);
    return;
  }

  if (logic['visibleWhen'] !== undefined) {
    validateCondition(logic['visibleWhen'], `${path}.visibleWhen`, context, issues, 1);
  }

  const jumpRules = logic['jumpRules'];
  if (jumpRules === undefined) {
    return;
  }
  if (!Array.isArray(jumpRules)) {
    addIssue(issues, 'INVALID_LOGIC', 'jumpRules 必须是数组', `${path}.jumpRules`);
    return;
  }
  jumpRules.forEach((rule, index) => {
    const rulePath = `${path}.jumpRules[${index}]`;
    if (!isRecord(rule)) {
      addIssue(issues, 'INVALID_LOGIC', '跳转规则必须是对象', rulePath);
      return;
    }
    validateCondition(rule['when'], `${rulePath}.when`, context, issues, 1);
    validateJumpTarget(rule['target'], `${rulePath}.target`, context, issues);
  });
}

export function validateSurveyContent(content: ReadonlySurveyContent): ValidationResult {
  const issues: ValidationIssue[] = [];
  const raw: unknown = content;

  if (!isRecord(raw)) {
    addIssue(issues, 'INVALID_STRUCTURE', '问卷内容必须是对象', 'content');
    return summarize(issues);
  }

  const defaultLanguageRaw = raw['defaultLanguage'];
  let defaultLanguage: string | undefined;
  if (defaultLanguageRaw === undefined) {
    addIssue(issues, 'MISSING_DEFAULT_LANGUAGE', 'defaultLanguage 不能为空', 'defaultLanguage');
  } else if (!isValidLanguageTag(defaultLanguageRaw)) {
    addIssue(
      issues,
      'INVALID_LANGUAGE_TAG',
      'defaultLanguage 必须是合法语言键，如 zh-CN、en',
      'defaultLanguage',
    );
  } else {
    defaultLanguage = defaultLanguageRaw;
  }

  const title = raw['title'];
  if (title === undefined) {
    addIssue(issues, 'MISSING_TITLE', '问卷标题不能为空', 'title');
  } else {
    validateLocalizedText(title, 'title', defaultLanguage, issues);
  }

  const description = raw['description'];
  if (description !== undefined) {
    validateLocalizedText(description, 'description', defaultLanguage, issues);
  }

  const groups = raw['groups'];
  if (!Array.isArray(groups)) {
    addIssue(issues, 'INVALID_STRUCTURE', 'groups 必须是数组', 'groups');
    return summarize(issues);
  }
  if (groups.length === 0) {
    addIssue(issues, 'EMPTY_SURVEY', '问卷至少需要一个分组', 'groups');
    return summarize(issues);
  }

  const groupIds = new Set<string>();
  const questionIds = new Set<string>();
  const questionTypes = new Map<string, string>();
  const logicEntries: LogicEntry[] = [];

  groups.forEach((group, groupIndex) => {
    const groupPath = `groups[${groupIndex}]`;
    if (!isRecord(group)) {
      addIssue(issues, 'INVALID_STRUCTURE', '分组必须是对象', groupPath);
      return;
    }

    const groupId = readId(group, 'id', groupPath, issues);
    if (groupId) {
      if (groupIds.has(groupId)) {
        addIssue(issues, 'DUPLICATE_GROUP_ID', `分组 id 重复：${groupId}`, `${groupPath}.id`);
      }
      groupIds.add(groupId);
    }

    if (group['title'] !== undefined) {
      validateLocalizedText(group['title'], `${groupPath}.title`, defaultLanguage, issues);
    }
    if (group['description'] !== undefined) {
      validateLocalizedText(
        group['description'],
        `${groupPath}.description`,
        defaultLanguage,
        issues,
      );
    }

    const questions = group['questions'];
    if (!Array.isArray(questions)) {
      addIssue(issues, 'INVALID_STRUCTURE', 'questions 必须是数组', `${groupPath}.questions`);
      return;
    }
    if (questions.length === 0) {
      addIssue(issues, 'EMPTY_GROUP', '分组至少需要一道题目', `${groupPath}.questions`);
    }

    if (group['logic'] !== undefined) {
      logicEntries.push({ logic: group['logic'], path: `${groupPath}.logic` });
    }

    questions.forEach((question, questionIndex) => {
      const questionPath = `${groupPath}.questions[${questionIndex}]`;
      if (!isRecord(question)) {
        addIssue(issues, 'INVALID_STRUCTURE', '题目必须是对象', questionPath);
        return;
      }

      const questionId = readId(question, 'id', questionPath, issues);
      if (questionId) {
        if (questionIds.has(questionId)) {
          addIssue(
            issues,
            'DUPLICATE_QUESTION_ID',
            `题目 id 重复：${questionId}`,
            `${questionPath}.id`,
          );
        }
        questionIds.add(questionId);
      }

      if (question['title'] === undefined) {
        addIssue(issues, 'MISSING_TITLE', '题目标题不能为空', `${questionPath}.title`);
      } else {
        validateLocalizedText(question['title'], `${questionPath}.title`, defaultLanguage, issues);
      }

      if (question['description'] !== undefined) {
        validateLocalizedText(
          question['description'],
          `${questionPath}.description`,
          defaultLanguage,
          issues,
        );
      }

      if (question['required'] !== undefined && typeof question['required'] !== 'boolean') {
        addIssue(issues, 'INVALID_STRUCTURE', 'required 必须是布尔值', `${questionPath}.required`);
      }

      const type = question['type'];
      if (!isQuestionType(type)) {
        addIssue(
          issues,
          'UNSUPPORTED_QUESTION_TYPE',
          `不支持的题型：${String(type)}`,
          `${questionPath}.type`,
        );
        return;
      }
      if (questionId) {
        questionTypes.set(questionId, type);
      }

      const config = question['config'];
      if (!isRecord(config)) {
        addIssue(issues, 'INVALID_STRUCTURE', 'config 必须是对象', `${questionPath}.config`);
        return;
      }
      validateQuestionConfig(type, config, `${questionPath}.config`, defaultLanguage, issues);

      if (question['logic'] !== undefined) {
        logicEntries.push({ logic: question['logic'], path: `${questionPath}.logic` });
      }
    });
  });

  const context: LogicContext = { questionTypes, questionIds, groupIds };
  logicEntries.forEach((entry) => validateLogic(entry.logic, entry.path, context, issues));

  return summarize(issues);
}

export function assertValidSurveyContent(content: ReadonlySurveyContent): void {
  const result = validateSurveyContent(content);
  if (!result.valid) {
    throw new SurveyValidationError(result.errors);
  }
}

export function validateSurveyDraft(draft: SurveyDraft): ValidationResult {
  const issues: ValidationIssue[] = [];
  issues.push(...validateSurveyContent(draft.content).issues);

  if (!isNonEmptyString(draft.surveyId)) {
    addIssue(issues, 'MISSING_ID', 'surveyId 不能为空', 'surveyId');
  }

  return summarize(issues);
}
