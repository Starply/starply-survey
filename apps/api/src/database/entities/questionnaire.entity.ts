import type { QuestionnaireStatus } from '@starply/contracts';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from './base.entity';

/**
 * 问卷主体：只保存租户内标识、状态与版本指针，题目内容在 questionnaire_version。
 * 草稿与已发布版本各占一行，因此编辑草稿不会影响历史发布快照。
 */
@Entity({ name: 'questionnaire' })
@Index('uq_questionnaire_tenant_slug', ['tenantId', 'slug'], { unique: true })
export class Questionnaire extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 36 })
  tenantId!: string;

  /** 租户内唯一的问卷短标识，用于公开填写地址。 */
  @Column({ type: 'varchar', length: 128 })
  slug!: string;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: QuestionnaireStatus;

  /** 当前可编辑草稿；创建问卷时与主体在同一事务内写入。 */
  @Column({ name: 'draft_version_id', type: 'varchar', length: 36, nullable: true })
  draftVersionId!: string | null;

  /** 最新已发布版本；发布指针只增不改，历史版本仍保留在版本表中。 */
  @Column({ name: 'published_version_id', type: 'varchar', length: 36, nullable: true })
  publishedVersionId!: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy!: string | null;
}
