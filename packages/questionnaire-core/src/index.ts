/**
 * 问卷领域内核：题型模型、schema 静态校验、草稿/发布版本语义。
 * 纯 TypeScript，不依赖 Angular、NestJS 或数据库。
 */

export * from './localization';
export * from './types';
export * from './validation';
export * from './answers';
export * from './versioning';

/** 包自身版本，供问卷内容与发布快照绑定使用。 */
export const QUESTIONNAIRE_CORE_VERSION = '0.0.0';
