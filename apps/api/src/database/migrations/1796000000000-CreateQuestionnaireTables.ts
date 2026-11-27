import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 问卷落库：问卷主体与版本表。
 * 草稿与发布版本共用 questionnaire_version，靠 status/version 区分；
 * questionnaire 上的两个版本指针不加外键，避免与版本表的循环依赖。
 * MySQL 的 DDL 会隐式提交，回滚通过 migration:revert 执行 down。
 */
export class CreateQuestionnaireTables1796000000000 implements MigrationInterface {
  name = 'CreateQuestionnaireTables1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`questionnaire\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`slug\` varchar(128) NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'draft',
        \`draft_version_id\` varchar(36) NULL,
        \`published_version_id\` varchar(36) NULL,
        \`created_by\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_questionnaire_tenant_slug\` (\`tenant_id\`, \`slug\`),
        CONSTRAINT \`fk_questionnaire_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenant\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_questionnaire_created_by\` FOREIGN KEY (\`created_by\`) REFERENCES \`user\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    await queryRunner.query(`
      CREATE TABLE \`questionnaire_version\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`questionnaire_id\` varchar(36) NOT NULL,
        \`status\` varchar(16) NOT NULL,
        \`version\` int NULL,
        \`schema_version\` int NOT NULL DEFAULT 1,
        \`content\` json NOT NULL,
        \`published_at\` datetime(6) NULL,
        \`created_by\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_questionnaire_version_number\` (\`questionnaire_id\`, \`version\`),
        CONSTRAINT \`fk_questionnaire_version_questionnaire\` FOREIGN KEY (\`questionnaire_id\`) REFERENCES \`questionnaire\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_questionnaire_version_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenant\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_questionnaire_version_created_by\` FOREIGN KEY (\`created_by\`) REFERENCES \`user\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `questionnaire_version`');
    await queryRunner.query('DROP TABLE `questionnaire`');
  }
}
