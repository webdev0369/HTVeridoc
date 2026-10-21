import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationFieldConfig1730000006000
  implements MigrationInterface
{
  name = 'OrganizationFieldConfig1730000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_document_field_config (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        document_type varchar(64) NOT NULL,
        field_key varchar(128) NOT NULL,
        mode varchar(16) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_org_doc_field_config
          UNIQUE (organization_id, document_type, field_key)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_doc_field_config_org_type
      ON organization_document_field_config (organization_id, document_type);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS organization_document_field_config;`,
    );
  }
}
