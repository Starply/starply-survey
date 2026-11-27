import type { MembershipStatus, TenantRole } from '@starply/contracts';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from './base.entity';

/**
 * 用户在某租户内的成员关系。
 * 一个用户在一个租户内只有一条记录；角色与状态取值来自 tenancy-core。
 */
@Entity({ name: 'membership' })
@Index('uq_membership_tenant_user', ['tenantId', 'userId'], { unique: true })
@Index('idx_membership_user', ['userId'])
export class Membership extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 36 })
  tenantId!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: TenantRole;

  @Column({ type: 'varchar', length: 16, default: 'invited' })
  status!: MembershipStatus;
}
