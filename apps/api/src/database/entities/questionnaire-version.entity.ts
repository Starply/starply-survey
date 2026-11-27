import type { QuestionnaireStatus } from '@starply/contracts';
import type { SurveyContent } from '@starply/questionnaire-core';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from './base.entity';

/**
 * 问卷版本：草稿与已发布版本共用一张表，靠 status 与 version 区分。
 * - 草稿每份问卷只有一行，version 为 NULL，可反复覆盖；
 * - 已发布版本 version 从 1 递增，(questionnaire_id, version) 唯一；
 * - 已发布行没有写接口，content 即发布瞬间的快照。
 */
@Entity({ name: 'questionnaire_version' })
@Index('uq_questionnaire_version_number', ['questionnaireId', 'version'], { unique: true })
export class QuestionnaireVersion extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 36 })
  tenantId!: string;

  @Column({ name: 'questionnaire_id', type: 'varchar', length: 36 })
  questionnaireId!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: QuestionnaireStatus;

  /** 已发布版本从 1 开始递增；草稿为 NULL。 */
  @Column({ type: 'int', nullable: true })
  version!: number | null;

  /** 内容 schema 版本，与 questionnaire-core 的 QUESTIONNAIRE_SCHEMA_VERSION 对齐。 */
  @Column({ name: 'schema_version', type: 'int', default: 1 })
  schemaVersion!: number;

  /** 草稿内容或发布快照；由 questionnaire-core 负责校验与冻结。 */
  @Column({ type: 'json' })
  content!: SurveyContent;

  @Column({ name: 'published_at', type: 'datetime', precision: 6, nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy!: string | null;
}
