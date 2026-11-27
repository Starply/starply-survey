import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { TimestampedEntity } from './base.entity';

/**
 * 全局用户身份：一个用户可属于多个租户，角色由 membership 决定。
 * 邮箱全局唯一；密码哈希算法在认证接口落地时确定（评估文档建议 Argon2id）。
 */
@Entity({ name: 'user' })
@Index('uq_user_email', ['email'], { unique: true })
export class User extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 128 })
  displayName!: string;

  /** active / disabled；停用后拒绝登录，但保留成员关系与审计记录。 */
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: string;
}
