import { MigrationInterface, QueryRunner } from 'typeorm';

export class LineItemUnits1730000004000 implements MigrationInterface {
  name = 'LineItemUnits1730000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        ADD COLUMN IF NOT EXISTS purchase_unit varchar(64) NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        ADD COLUMN IF NOT EXISTS stocktaking_unit varchar(64) NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        ADD COLUMN IF NOT EXISTS stock_taking_qty_per_purchase_unit numeric(18,6) NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        ADD COLUMN IF NOT EXISTS base_measurement_unit varchar(64) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        DROP COLUMN IF EXISTS purchase_unit;
    `);
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        DROP COLUMN IF EXISTS stocktaking_unit;
    `);
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        DROP COLUMN IF EXISTS stock_taking_qty_per_purchase_unit;
    `);
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        DROP COLUMN IF EXISTS base_measurement_unit;
    `);
  }
}
