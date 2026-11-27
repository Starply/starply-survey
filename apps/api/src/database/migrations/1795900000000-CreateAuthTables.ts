import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 认证与租户落库：租户状态、全局用户、成员关系与邀请。
 * MySQL 的 DDL 会隐式提交，回滚通过 migration:revert 执行 down，而不是事务回滚。
 */
export class CreateAuthTables1795900000000 implements MigrationInterface {
  name = 'CreateAuthTables1795900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `tenant` ADD COLUMN `status` varchar(16) NOT NULL DEFAULT 'active' AFTER `name`",
    );

    await queryRunner.query(`
      CREATE TABLE \`user\` (
        \`id\` varchar(36) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`password_hash\` varchar(255) NOT NULL,
        \`display_name\` varchar(128) NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'active',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_user_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`membership\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`user_id\` varchar(36) NOT NULL,
        \`role\` varchar(16) NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'invited',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_membership_tenant_user\` (\`tenant_id\`, \`user_id\`),
        KEY \`idx_membership_user\` (\`user_id\`),
        CONSTRAINT \`fk_membership_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenant\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_membership_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`invitation\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`role\` varchar(16) NOT NULL,
        \`invited_by\` varchar(36) NULL,
        \`token_hash\` varchar(64) NOT NULL,
        \`expires_at\` datetime(6) NOT NULL,
        \`accepted_at\` datetime(6) NULL,
        \`revoked_at\` datetime(6) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_invitation_token_hash\` (\`token_hash\`),
        KEY \`idx_invitation_tenant_email\` (\`tenant_id\`, \`email\`),
        CONSTRAINT \`fk_invitation_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenant\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_invitation_user\` FOREIGN KEY (\`invited_by\`) REFERENCES \`user\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `invitation`');
    await queryRunner.query('DROP TABLE `membership`');
    await queryRunner.query('DROP TABLE `user`');
    await queryRunner.query('ALTER TABLE `tenant` DROP COLUMN `status`');
  }
}
