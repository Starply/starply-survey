import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 最小实体 tenant 的首个迁移。
 * MySQL 的 DDL 会隐式提交，回滚通过 migration:revert 执行 down，而不是事务回滚。
 */
export class CreateTenant1795000000000 implements MigrationInterface {
  name = 'CreateTenant1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`tenant\` (
        \`id\` varchar(36) NOT NULL,
        \`slug\` varchar(64) NOT NULL,
        \`name\` varchar(128) NOT NULL,
        \`default_language\` varchar(16) NOT NULL DEFAULT 'zh-CN',
        \`default_timezone\` varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_tenant_slug\` (\`slug\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `tenant`');
  }
}
