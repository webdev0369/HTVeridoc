import { MigrationInterface, QueryRunner } from 'typeorm';

export class TotalCtrlIntegration1730000012000 implements MigrationInterface {
  name = 'TotalCtrlIntegration1730000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS totalctrl_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        base_url varchar(1024) NULL,
        api_key text NULL,
        username varchar(255) NULL,
        password text NULL,
        mode varchar(32) NOT NULL DEFAULT 'mock',
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_totalctrl_connection_org UNIQUE (organization_id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS totalctrl_supplier_mappings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        external_supplier_key varchar(512) NOT NULL,
        totalctrl_supplier_id varchar(128) NOT NULL,
        totalctrl_supplier_name varchar(512) NULL,
        match_method varchar(64) NOT NULL DEFAULT 'manual',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_totalctrl_supplier_map
          UNIQUE (organization_id, external_supplier_key)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_totalctrl_supplier_map_org
      ON totalctrl_supplier_mappings (organization_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS totalctrl_product_mappings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        supplier_key varchar(512) NOT NULL DEFAULT '',
        article_number varchar(255) NOT NULL,
        sku varchar(255) NULL,
        totalctrl_product_id varchar(128) NOT NULL,
        match_method varchar(64) NOT NULL DEFAULT 'manual',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_totalctrl_product_map
          UNIQUE (organization_id, supplier_key, article_number)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_totalctrl_product_map_lookup
      ON totalctrl_product_mappings (organization_id, article_number);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS totalctrl_po_mappings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        external_po_number varchar(255) NULL,
        totalctrl_po_id varchar(128) NULL,
        export_status varchar(32) NOT NULL DEFAULT 'pending',
        match_summary jsonb NULL,
        export_payload jsonb NULL,
        last_error text NULL,
        exported_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_totalctrl_po_map_document UNIQUE (document_id)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_totalctrl_po_map_org
      ON totalctrl_po_mappings (organization_id, export_status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS totalctrl_po_mappings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS totalctrl_product_mappings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS totalctrl_supplier_mappings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS totalctrl_connections;`);
  }
}
