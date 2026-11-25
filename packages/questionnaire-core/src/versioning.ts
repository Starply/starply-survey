import type { LanguageTag, LocalizedText } from './localization';
import {
  QUESTIONNAIRE_SCHEMA_VERSION,
  type PublishedSurveyVersion,
  type PublishSurveyOptions,
  type ReadonlySurveyContent,
  type SurveyContent,
  type SurveyDraft,
  type ValidationIssue,
} from './types';
import { SurveyValidationError, validateSurveyContent } from './validation';

export interface CreateSurveyDraftInput {
  surveyId: string;
  defaultLanguage: LanguageTag;
  title: LocalizedText;
  description?: LocalizedText;
  groups: SurveyContent['groups'];
}

export function createSurveyDraft(input: CreateSurveyDraftInput): SurveyDraft {
  const content: SurveyContent = {
    defaultLanguage: input.defaultLanguage,
    title: input.title,
    groups: input.groups,
  };
  if (input.description !== undefined) {
    content.description = input.description;
  }

  return {
    kind: 'draft',
    surveyId: input.surveyId,
    content,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    for (const item of value as unknown[]) {
      clone.push(deepClone(item));
    }
    return clone as unknown as T;
  }
  if (isPlainObject(value)) {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      clone[key] = deepClone(item);
    }
    return clone as unknown as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) {
      deepFreeze(item);
    }
    return Object.freeze(value) as unknown as T;
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    return Object.freeze(value) as unknown as T;
  }
  return value;
}

function versionIssue(
  code: ValidationIssue['code'],
  message: string,
  path: string,
): ValidationIssue {
  return { code, message, path, severity: 'error' };
}

function validatePublishOptions(
  options: PublishSurveyOptions,
  publishedAt: string,
  schemaVersion: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (typeof options.versionId !== 'string' || options.versionId.trim().length === 0) {
    issues.push(versionIssue('MISSING_ID', 'versionId 不能为空', 'versionId'));
  }
  if (!Number.isInteger(options.version) || options.version < 1) {
    issues.push(versionIssue('INVALID_VERSION', 'version 必须是不小于 1 的整数', 'version'));
  }
  if (!Number.isFinite(Date.parse(publishedAt))) {
    issues.push(
      versionIssue('INVALID_VERSION', 'publishedAt 必须是合法的时间字符串', 'publishedAt'),
    );
  }
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    issues.push(
      versionIssue('INVALID_VERSION', 'schemaVersion 必须是不小于 1 的整数', 'schemaVersion'),
    );
  }

  return issues;
}

/**
 * 发布草稿，返回深度冻结的版本快照。
 * 草稿内容非法、版本参数非法时抛出 SurveyValidationError。
 */
export function publishSurvey(
  draft: SurveyDraft,
  options: PublishSurveyOptions,
): PublishedSurveyVersion {
  if (!draft || draft.kind !== 'draft') {
    throw new TypeError('publishSurvey 仅接受 kind 为 draft 的问卷草稿');
  }

  const publishedAt = options.publishedAt ?? new Date().toISOString();
  const schemaVersion = options.schemaVersion ?? QUESTIONNAIRE_SCHEMA_VERSION;

  const issues: ValidationIssue[] = [
    ...validatePublishOptions(options, publishedAt, schemaVersion),
  ];

  if (typeof draft.surveyId !== 'string' || draft.surveyId.trim().length === 0) {
    issues.push(versionIssue('MISSING_ID', 'surveyId 不能为空', 'surveyId'));
  }

  issues.push(...validateSurveyContent(draft.content).errors);

  const errors = issues.filter((item) => item.severity === 'error');
  if (errors.length > 0) {
    throw new SurveyValidationError(errors);
  }

  const snapshot = deepFreeze(deepClone(draft.content)) as ReadonlySurveyContent;

  return deepFreeze({
    kind: 'published',
    surveyId: draft.surveyId,
    versionId: options.versionId,
    version: options.version,
    schemaVersion,
    publishedAt,
    content: snapshot,
  });
}
