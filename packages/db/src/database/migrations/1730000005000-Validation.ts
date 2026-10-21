import { MigrationInterface, QueryRunner } from 'typeorm';

export class Validation1730000005000 implements MigrationInterface {
  name = 'Validation1730000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS validation_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL UNIQUE,
        organization_id uuid NOT NULL,
        extraction_id uuid NULL,
        status varchar(32) NOT NULL DEFAULT 'pending',
        error_count int NOT NULL DEFAULT 0,
        warning_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS validation_errors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        validation_result_id uuid NOT NULL REFERENCES validation_results(id) ON DELETE CASCADE,
        severity varchar(16) NOT NULL,
        code varchar(64) NOT NULL,
        message text NOT NULL,
        field_key varchar(128) NULL,
        line_item_id uuid NULL,
        meta jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_validation_errors_result
      ON validation_errors (validation_result_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS validation_errors;`);
    await queryRunner.query(`DROP TABLE IF EXISTS validation_results;`);
  }
}
