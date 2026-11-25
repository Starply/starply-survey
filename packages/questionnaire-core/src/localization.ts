/**
 * 多语言文本的基础类型与解析规则。
 * 文本按语言键索引，缺省时回退到调用方指定的默认语言（问卷或租户默认语言）。
 */

/** BCP 47 风格的语言键，如 zh-CN、en、pt-BR。 */
export type LanguageTag = string;

/** 用户可见文本的统一结构：语言键 -> 文案。 */
export type LocalizedText = Record<LanguageTag, string>;

/** 宽松的语言键校验：主语言 2-3 位，可带子标签。 */
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i;

export function isValidLanguageTag(value: unknown): value is LanguageTag {
  return typeof value === 'string' && LANGUAGE_TAG_PATTERN.test(value);
}

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function findLocalizedValue(text: LocalizedText, language: LanguageTag): string | undefined {
  const direct = text[language];
  if (isNonBlank(direct)) {
    return direct;
  }

  const target = language.toLowerCase();
  for (const [key, value] of Object.entries(text)) {
    if (key.toLowerCase() === target && isNonBlank(value)) {
      return value;
    }
  }

  return undefined;
}

/**
 * 解析目标语言文案；目标语言缺失或为空时回退到 defaultLanguage。
 * defaultLanguage 由调用方传入：通常是 survey.defaultLanguage，
 * 若租户强制语言策略，则传租户默认语言作为有效默认值。
 */
export function resolveLocalizedText(
  text: LocalizedText,
  targetLanguage: LanguageTag,
  defaultLanguage: LanguageTag,
): string | undefined {
  return findLocalizedValue(text, targetLanguage) ?? findLocalizedValue(text, defaultLanguage);
}
