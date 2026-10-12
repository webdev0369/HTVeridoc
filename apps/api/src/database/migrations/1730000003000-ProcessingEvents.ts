import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProcessingEvents1730000003000 implements MigrationInterface {
  name = 'ProcessingEvents1730000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS document_processing_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL,
        organization_id uuid NOT NULL,
        step varchar(64) NOT NULL,
        level varchar(32) NOT NULL DEFAULT 'info',
        message text NOT NULL,
        meta jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_doc_processing_events_doc
      ON document_processing_events (document_id, created_at);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_doc_processing_events_org
      ON document_processing_events (organization_id, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS document_processing_events;`);
  }
}
