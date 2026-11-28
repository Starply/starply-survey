import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 问卷回答落库。
 * answers 使用 JSON 列保存以题目 id 为键的作答；按问卷建索引便于后续统计。
 * MySQL DDL 隐式提交，回滚通过 migration:revert 执行 down。
 */
export class CreateSurveyResponseTable1797000000000 implements MigrationInterface {
  name = 'CreateSurveyResponseTable1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`survey_response\` (
        \`id\` varchar(36) NOT NULL,
        \`tenant_id\` varchar(36) NOT NULL,
        \`questionnaire_id\` varchar(36) NOT NULL,
        \`questionnaire_version_id\` varchar(36) NOT NULL,
        \`version\` int NOT NULL,
        \`language\` varchar(16) NULL,
        \`answers\` json NOT NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`idx_survey_response_questionnaire\` (\`questionnaire_id\`),
        CONSTRAINT \`fk_survey_response_tenant\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenant\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_survey_response_questionnaire\` FOREIGN KEY (\`questionnaire_id\`) REFERENCES \`questionnaire\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_survey_response_version\` FOREIGN KEY (\`questionnaire_version_id\`) REFERENCES \`questionnaire_version\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `survey_response`');
  }
}
