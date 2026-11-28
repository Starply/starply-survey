import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 题库条目落库。
 * title/description/config/tags 使用 JSON 列，便于与 question-core 的题型模型直接映射。
 * MySQL DDL 隐式提交，回滚通过 migration:revert 执行 down。
 */
export class CreateQuestionBankItemTable1798000000000 implements MigrationInterface {
  name = 'CreateQuestionBankItemTable1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`question_bank_item\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`type\` varchar(32) NOT NULL,
        \`title\` json NOT NULL,
        \`description\` json NULL,
        \`config\` json NOT NULL,
        \`tags\` json NULL,
        \`created_by\` varchar(36) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_question_bank_item_tenant\` (\`tenant_id\`),
        CONSTRAINT \`fk_question_bank_item_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenant\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_question_bank_item_created_by\` FOREIGN KEY (\`created_by\`) REFERENCES \`user\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `question_bank_item`');
  }
}
