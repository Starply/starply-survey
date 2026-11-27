import type { LanguageTag, LocalizedText } from '@starply/contracts';
import { resolveLocalizedText } from '@starply/questionnaire-core';

/** 取目标语言文案，缺失时回退到默认语言，再回退到任意已有语言。 */
export function textFor(text: LocalizedText | undefined, language: LanguageTag): string {
  if (!text) {
    return '';
  }

  return resolveLocalizedText(text, language, language) ?? Object.values(text)[0] ?? '';
}

/**
 * 只改动指定语言的文案。
 * 编辑器当前只编辑默认语言，其他语言的文案原样保留。
 */
export function setText(
  text: LocalizedText | undefined,
  language: LanguageTag,
  value: string,
): LocalizedText {
  return { ...(text ?? {}), [language]: value };
}

/** ISO 时间转本地可读文案；非法时间原样返回，便于排查。 */
export function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}
