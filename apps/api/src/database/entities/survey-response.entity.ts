import type { SurveyAnswers } from '@starply/questionnaire-core';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from './base.entity';

/**
 * 一次问卷提交。
 * 记录作答时的问卷版本，后续问卷再发布也不会影响历史回答；
 * answers 以题目 id 为键，结构与 questionnaire-core 的 SurveyAnswers 一致。
 */
@Entity({ name: 'survey_response' })
@Index('idx_survey_response_questionnaire', ['questionnaireId'])
export class SurveyResponse extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 36 })
  tenantId!: string;

  @Column({ name: 'questionnaire_id', type: 'varchar', length: 36 })
  questionnaireId!: string;

  @Column({ name: 'questionnaire_version_id', type: 'varchar', length: 36 })
  questionnaireVersionId!: string;

  /** 作答时对应的已发布版本号，便于按版本统计。 */
  @Column({ type: 'int' })
  version!: number;

  /** 填写者使用的语言；未提供时为 NULL。 */
  @Column({ type: 'varchar', length: 16, nullable: true })
  language!: string | null;

  @Column({ type: 'json' })
  answers!: SurveyAnswers;
}
