import { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldCorrections1730000009000 implements MigrationInterface {
  name = 'FieldCorrections1730000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_field_corrections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        document_type varchar(64) NOT NULL,
        field_key varchar(128) NOT NULL,
        from_value text NOT NULL,
        to_value text NOT NULL,
        hit_count int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_org_field_correction
          UNIQUE (organization_id, document_type, field_key, from_value)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_field_correction_lookup
      ON organization_field_corrections (organization_id, document_type, field_key);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS organization_field_corrections;`,
    );
  }
}
