import type { LocalizedText, QuestionBankItemConfig, QuestionType } from '@starply/contracts';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from './base.entity';

/**
 * 题库条目：可复用的题目模板。
 * type 与 config 与问卷题目共享同一套模型，后续可从题库直接复制到问卷编辑器。
 * 选题组件的默认值由前端负责，服务端只校验结构（type 合法、title 非空、config 为对象）。
 */
@Entity({ name: 'question_bank_item' })
@Index('idx_question_bank_item_tenant', ['tenantId'])
export class QuestionBankItem extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 36 })
  tenantId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: QuestionType;

  @Column({ type: 'json' })
  title!: LocalizedText;

  @Column({ type: 'json', nullable: true })
  description!: LocalizedText | null;

  @Column({ type: 'json' })
  config!: QuestionBankItemConfig;

  @Column({ type: 'json', nullable: true })
  tags!: string[] | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy!: string | null;
}
