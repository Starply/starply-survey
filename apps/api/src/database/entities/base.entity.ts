import { BeforeInsert, BeforeUpdate, Column } from 'typeorm';

/**
 * 统一时间戳基类。
 * 时间由应用写入（BeforeInsert/BeforeUpdate），配合 mysql2 timezone=Z 存 UTC。
 * 不使用 @CreateDateColumn/@UpdateDateColumn：它们依赖数据库 CURRENT_TIMESTAMP，
 * 受服务器 session 时区影响。
 */
export abstract class TimestampedEntity {
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
