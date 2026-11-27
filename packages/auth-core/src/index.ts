/**
 * 认证内核：服务端会话生命周期、短期访问令牌与登录/刷新/登出编排。
 * 纯 TypeScript + Node 内置模块，不依赖 NestJS、数据库或具体 Redis 客户端。
 */

export * from './auth-session.service';
export * from './session-keys';
export * from './session-policy';
export * from './session-store';
export * from './tokens';
export * from './types';

/** 包自身版本。 */
export const AUTH_CORE_VERSION = '0.0.0';
