import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiExtraction1730000001000 implements MigrationInterface {
  name = 'AiExtraction1730000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS extractions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL UNIQUE,
        organization_id uuid NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'pending',
        model varchar(128) NULL,
        prompt_version varchar(32) NULL,
        schema_version varchar(32) NULL,
        raw_response jsonb NULL,
        structured_data jsonb NULL,
        error_message text NULL,
        processing_time_ms int NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_extractions_org_created
      ON extractions (organization_id, created_at);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL,
        organization_id uuid NOT NULL,
        model varchar(128) NOT NULL,
        prompt_version varchar(32) NOT NULL,
        schema_version varchar(32) NOT NULL,
        input_tokens int NOT NULL DEFAULT 0,
        output_tokens int NOT NULL DEFAULT 0,
        total_tokens int NOT NULL DEFAULT 0,
        estimated_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
        processing_time_ms int NOT NULL DEFAULT 0,
        status varchar(32) NOT NULL,
        error_message text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_requests_org_created
      ON ai_requests (organization_id, created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_requests_document
      ON ai_requests (document_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_requests;`);
    await queryRunner.query(`DROP TABLE IF EXISTS extractions;`);
  }
}
