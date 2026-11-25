import { BeforeInsert, BeforeUpdate, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 最小租户实体，用于打通 TypeORM 地基。
 * 表名与列名显式使用 snake_case，避免依赖数据库的大小写折叠行为。
 */
@Entity({ name: 'tenant' })
@Index('uq_tenant_slug', ['slug'], { unique: true })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ name: 'default_language', type: 'varchar', length: 16, default: 'zh-CN' })
  defaultLanguage!: string;

  @Column({ name: 'default_timezone', type: 'varchar', length: 64, default: 'Asia/Shanghai' })
  defaultTimeZone!: string;

  /**
   * 时间戳由应用写入（BeforeInsert/BeforeUpdate），配合 mysql2 timezone=Z 存 UTC。
   * 不使用 @CreateDateColumn/@UpdateDateColumn：它们会依赖数据库 CURRENT_TIMESTAMP，
   * 受服务器 session 时区影响。
   */
  @Column({
    name: 'created_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt!: Date;

  @BeforeInsert()
  protected touchCreatedAt(): void {
    const now = new Date();
    this.createdAt = now;
    this.updatedAt = now;
  }

  @BeforeUpdate()
  protected touchUpdatedAt(): void {
    this.updatedAt = new Date();
  }
}
