/**
 * 租户与租户内授权内核：租户标识、路径解析、角色权限与访问判定。
 * 纯 TypeScript，不依赖 Angular、NestJS 或数据库；前后端共用同一套规则。
 */

export * from './access';
export * from './path';
export * from './roles';
export * from './slug';

/** 包自身版本。 */
export const TENANCY_CORE_VERSION = '0.0.0';
