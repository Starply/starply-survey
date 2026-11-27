import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { TenantStatus } from '@starply/contracts';

import { TimestampedEntity } from './base.entity';

/**
 * 租户实体。
 * 表名与列名显式使用 snake_case，避免依赖数据库的大小写折叠行为。
 */
@Entity({ name: 'tenant' })
@Index('uq_tenant_slug', ['slug'], { unique: true })
export class Tenant extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  /** active / suspended / archived，取值与 tenancy-core 的 TenantStatus 一致。 */
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: TenantStatus;

  @Column({ name: 'default_language', type: 'varchar', length: 16, default: 'zh-CN' })
  defaultLanguage!: string;

  @Column({ name: 'default_timezone', type: 'varchar', length: 64, default: 'Asia/Shanghai' })
  defaultTimeZone!: string;
}
