import type { TenantRole } from '@starply/contracts';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from './base.entity';

/**
 * 租户邀请。
 * 状态不单独建列，由 acceptedAt / revokedAt / expiresAt 推导：
 * 已接受、已撤销、已过期，其余视为待处理。
 * tokenHash 存令牌哈希而非明文；令牌只在发出时可见一次。
 */
@Entity({ name: 'invitation' })
@Index('uq_invitation_token_hash', ['tokenHash'], { unique: true })
@Index('idx_invitation_tenant_email', ['tenantId', 'email'])
export class Invitation extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 36 })
  tenantId!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: TenantRole;

  /** 邀请人；被邀请人接受后仍需由服务层校验邀请人权限。 */
  @Column({ name: 'invited_by', type: 'varchar', length: 36, nullable: true })
  invitedBy!: string | null;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'datetime', precision: 6, nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'datetime', precision: 6, nullable: true })
  revokedAt!: Date | null;
}
