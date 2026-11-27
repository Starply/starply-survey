import { describe, expect, it } from 'vitest';

import {
  checkTenantSlug,
  isValidTenantSlug,
  isReservedTenantSlug,
  normalizeTenantSlug,
  TENANT_SLUG_MAX_LENGTH,
} from './slug';

describe('isValidTenantSlug', () => {
  it('接受小写字母、数字与连字符', () => {
    expect(isValidTenantSlug('acme')).toBe(true);
    expect(isValidTenantSlug('acme-2026')).toBe(true);
    expect(isValidTenantSlug('a1b')).toBe(true);
    expect(isValidTenantSlug('a'.repeat(TENANT_SLUG_MAX_LENGTH))).toBe(true);
  });

  it('拒绝大写、过短、过长与非法字符', () => {
    expect(isValidTenantSlug('ACME')).toBe(false);
    expect(isValidTenantSlug('ab')).toBe(false);
    expect(isValidTenantSlug('a'.repeat(TENANT_SLUG_MAX_LENGTH + 1))).toBe(false);
    expect(isValidTenantSlug('ac_me')).toBe(false);
    expect(isValidTenantSlug('-acme')).toBe(false);
    expect(isValidTenantSlug('acme-')).toBe(false);
    expect(isValidTenantSlug('acme corp')).toBe(false);
    expect(isValidTenantSlug('中文')).toBe(false);
  });

  it('拒绝非字符串输入', () => {
    expect(isValidTenantSlug('')).toBe(false);
    expect(isValidTenantSlug(undefined)).toBe(false);
    expect(isValidTenantSlug(null)).toBe(false);
    expect(isValidTenantSlug(123)).toBe(false);
  });
});

describe('normalizeTenantSlug', () => {
  it('去掉首尾空白并转小写', () => {
    expect(normalizeTenantSlug('  AcMe  ')).toBe('acme');
  });

  it('不改写内部字符', () => {
    expect(normalizeTenantSlug('ac me')).toBe('ac me');
    expect(normalizeTenantSlug('ac_me')).toBe('ac_me');
  });
});

describe('isReservedTenantSlug', () => {
  it('识别保留 slug', () => {
    expect(isReservedTenantSlug('admin')).toBe(true);
    expect(isReservedTenantSlug('api')).toBe(true);
    expect(isReservedTenantSlug('t')).toBe(true);
    expect(isReservedTenantSlug('www')).toBe(true);
  });

  it('普通 slug 不算保留', () => {
    expect(isReservedTenantSlug('acme')).toBe(false);
    expect(isReservedTenantSlug('admin-team')).toBe(false);
  });
});

describe('checkTenantSlug', () => {
  it('规范化后通过校验', () => {
    expect(checkTenantSlug('  AcMe ')).toEqual({ ok: true, slug: 'acme' });
  });

  it('返回具体问题代码', () => {
    expect(checkTenantSlug('')).toEqual({ ok: false, issue: 'empty' });
    expect(checkTenantSlug('   ')).toEqual({ ok: false, issue: 'empty' });
    expect(checkTenantSlug(undefined)).toEqual({ ok: false, issue: 'empty' });
    expect(checkTenantSlug('ab')).toEqual({ ok: false, issue: 'length' });
    expect(checkTenantSlug('a'.repeat(TENANT_SLUG_MAX_LENGTH + 1))).toEqual({
      ok: false,
      issue: 'length',
    });
    expect(checkTenantSlug('ac_me')).toEqual({ ok: false, issue: 'format' });
    expect(checkTenantSlug('Admin')).toEqual({ ok: false, issue: 'reserved' });
  });
});
