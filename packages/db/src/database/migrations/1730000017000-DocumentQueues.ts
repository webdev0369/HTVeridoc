import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentQueues1730000017000 implements MigrationInterface {
  name = 'DocumentQueues1730000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS document_queues (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        description text NULL,
        document_type varchar(64) NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_document_queues_org_name
      ON document_queues (organization_id, lower(name))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_document_queues_org_active
      ON document_queues (organization_id, is_active)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS document_queue_members (
        queue_id uuid NOT NULL REFERENCES document_queues(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (queue_id, user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_document_queue_members_user
      ON document_queue_members (user_id)
    `);

    await queryRunner.query(`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS queue_id uuid NULL
      REFERENCES document_queues(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_org_queue
      ON documents (organization_id, queue_id)
    `);

    await queryRunner.query(`
      UPDATE permissions
      SET description = 'View document queues and background jobs'
      WHERE code = 'queue.read'
    `);
    await queryRunner.query(`
      UPDATE permissions
      SET description = 'Manage document queues and retry background jobs'
      WHERE code = 'queue.manage'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE permissions
      SET description = 'Read queues'
      WHERE code = 'queue.read'
    `);
    await queryRunner.query(`
      UPDATE permissions
      SET description = 'Manage queues'
      WHERE code = 'queue.manage'
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_documents_org_queue`);
    await queryRunner.query(`
      ALTER TABLE documents DROP COLUMN IF EXISTS queue_id
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS document_queue_members`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_document_queues_org_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_document_queues_org_name`);
    await queryRunner.query(`DROP TABLE IF EXISTS document_queues`);
  }
}
