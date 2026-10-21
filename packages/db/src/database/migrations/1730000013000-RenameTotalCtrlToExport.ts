import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames totalctrl_* tables/columns to export_* / destination_* names.
 * Safe if tables were already renamed (IF EXISTS / exception-tolerant ALTER).
 */
export class RenameTotalCtrlToExport1730000013000
  implements MigrationInterface
{
  name = 'RenameTotalCtrlToExport1730000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS totalctrl_connections RENAME TO export_connections;
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS totalctrl_supplier_mappings RENAME TO export_supplier_mappings;
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS totalctrl_product_mappings RENAME TO export_product_mappings;
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS totalctrl_po_mappings RENAME TO export_po_mappings;
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE export_supplier_mappings
          RENAME COLUMN totalctrl_supplier_id TO destination_supplier_id;
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE export_supplier_mappings
          RENAME COLUMN totalctrl_supplier_name TO destination_supplier_name;
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE export_product_mappings
          RENAME COLUMN totalctrl_product_id TO destination_product_id;
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE export_po_mappings
          RENAME COLUMN totalctrl_po_id TO destination_po_id;
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER INDEX IF EXISTS idx_totalctrl_supplier_map_org
          RENAME TO idx_export_supplier_map_org;
      EXCEPTION WHEN undefined_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER INDEX IF EXISTS idx_totalctrl_product_map_lookup
          RENAME TO idx_export_product_map_lookup;
      EXCEPTION WHEN undefined_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER INDEX IF EXISTS idx_totalctrl_po_map_org
          RENAME TO idx_export_po_map_org;
      EXCEPTION WHEN undefined_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE export_supplier_mappings
          RENAME COLUMN destination_supplier_id TO totalctrl_supplier_id;
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE export_supplier_mappings
          RENAME COLUMN destination_supplier_name TO totalctrl_supplier_name;
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE export_product_mappings
          RENAME COLUMN destination_product_id TO totalctrl_product_id;
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE export_po_mappings
          RENAME COLUMN destination_po_id TO totalctrl_po_id;
      EXCEPTION WHEN undefined_column THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS export_po_mappings RENAME TO totalctrl_po_mappings;
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS export_product_mappings RENAME TO totalctrl_product_mappings;
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS export_supplier_mappings RENAME TO totalctrl_supplier_mappings;
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE IF EXISTS export_connections RENAME TO totalctrl_connections;
      EXCEPTION WHEN duplicate_table THEN NULL;
      END $$;
    `);
  }
}
