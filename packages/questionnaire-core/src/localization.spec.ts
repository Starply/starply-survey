import { describe, expect, it } from 'vitest';

import { isValidLanguageTag, resolveLocalizedText } from './localization';

describe('isValidLanguageTag', () => {
  it('接受常见语言键', () => {
    expect(isValidLanguageTag('zh-CN')).toBe(true);
    expect(isValidLanguageTag('en')).toBe(true);
    expect(isValidLanguageTag('pt-BR')).toBe(true);
    expect(isValidLanguageTag('zh-Hant-TW')).toBe(true);
  });

  it('拒绝非法语言键', () => {
    expect(isValidLanguageTag('zh_CN')).toBe(false);
    expect(isValidLanguageTag('')).toBe(false);
    expect(isValidLanguageTag('chinese')).toBe(false);
    expect(isValidLanguageTag(123)).toBe(false);
    expect(isValidLanguageTag(undefined)).toBe(false);
  });
});

describe('resolveLocalizedText', () => {
  it('优先返回目标语言', () => {
    expect(resolveLocalizedText({ 'zh-CN': '你好', en: 'Hello' }, 'en', 'zh-CN')).toBe('Hello');
  });

  it('目标语言缺失时回退到默认语言', () => {
    expect(resolveLocalizedText({ 'zh-CN': '你好' }, 'en', 'zh-CN')).toBe('你好');
  });

  it('目标语言为空时回退到默认语言', () => {
    expect(resolveLocalizedText({ 'zh-CN': '你好', en: '   ' }, 'en', 'zh-CN')).toBe('你好');
  });

  it('语言键大小写不敏感', () => {
    expect(resolveLocalizedText({ 'zh-CN': '你好' }, 'ZH-cn', 'en')).toBe('你好');
    expect(resolveLocalizedText({ EN: 'Hello' }, 'en', 'zh-CN')).toBe('Hello');
  });

  it('目标语言与默认语言都没有文案时返回 undefined', () => {
    expect(resolveLocalizedText({ fr: 'Bonjour' }, 'en', 'zh-CN')).toBeUndefined();
  });
});
