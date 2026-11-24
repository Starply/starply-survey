/**
 * 首版题型占位。后续新增题型时扩展该联合，不要重建数据结构。
 * 矩阵等复杂题型按决策后置，接入时同样通过新增 type + config 扩展。
 */
export type QuestionType =
  'text' | 'textarea' | 'number' | 'email' | 'date' | 'single_choice' | 'multi_choice' | 'rating';

/**
 * 问卷内核版本，供发布版本与答卷绑定使用。
 */
export const QUESTIONNAIRE_CORE_VERSION = '0.0.0';
