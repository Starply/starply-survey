import { HttpErrorResponse } from '@angular/common/http';
import { describeApiError, isAuthExpiredError, normalizeApiError } from './api-error';

describe('normalizeApiError', () => {
  it('保留服务端错误码、文案与明细', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: {
        code: 'survey_invalid',
        message: '问卷内容未通过校验',
        details: [{ code: 'EMPTY_SURVEY', path: 'groups', message: '问卷不能为空' }],
      },
    });

    expect(normalizeApiError(error)).toEqual({
      status: 400,
      code: 'survey_invalid',
      message: '问卷内容未通过校验',
      details: [{ code: 'EMPTY_SURVEY', path: 'groups', message: '问卷不能为空' }],
    });
  });

  it('网络异常归一为 network_error', () => {
    const error = new HttpErrorResponse({ status: 0 });

    expect(normalizeApiError(error)).toMatchObject({
      status: 0,
      code: 'network_error',
    });
  });

  it('非结构化错误体退化为 http_error', () => {
    const error = new HttpErrorResponse({ status: 502, error: 'gateway down' });

    expect(normalizeApiError(error)).toEqual({
      status: 502,
      code: 'http_error',
      message: '请求失败（HTTP 502）',
    });
  });

  it('普通异常按 unknown_error 处理', () => {
    expect(normalizeApiError(new Error('boom'))).toMatchObject({
      code: 'unknown_error',
      message: 'boom',
    });
    expect(normalizeApiError('oops')).toMatchObject({ code: 'unknown_error' });
  });
});

describe('describeApiError', () => {
  it('优先展示服务端中文文案', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { code: 'questionnaire_slug_taken', message: '该租户下已存在相同 slug 的问卷' },
    });

    expect(describeApiError(error)).toBe('该租户下已存在相同 slug 的问卷');
  });

  it('缺少文案时回退到内置中文提示', () => {
    const error = new HttpErrorResponse({ status: 403, error: { code: 'permission_denied' } });

    expect(describeApiError(error)).toBe('当前角色没有该操作权限');
  });
});

describe('isAuthExpiredError', () => {
  it('401 与令牌过期都视为需要重新登录', () => {
    expect(isAuthExpiredError(new HttpErrorResponse({ status: 401 }))).toBe(true);
    expect(
      isAuthExpiredError(new HttpErrorResponse({ status: 400, error: { code: 'token_expired' } })),
    ).toBe(true);
  });

  it('业务错误不触发登录跳转', () => {
    expect(
      isAuthExpiredError(
        new HttpErrorResponse({ status: 404, error: { code: 'questionnaire_not_found' } }),
      ),
    ).toBe(false);
  });
});
