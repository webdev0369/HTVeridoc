import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaseUnitPriceFields1730000011000 implements MigrationInterface {
  name = 'BaseUnitPriceFields1730000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        ADD COLUMN IF NOT EXISTS price_per_base_unit numeric(18,6) NULL,
        ADD COLUMN IF NOT EXISTS stock_taking_qty_per_base_unit numeric(18,6) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        DROP COLUMN IF EXISTS stock_taking_qty_per_base_unit,
        DROP COLUMN IF EXISTS price_per_base_unit;
    `);
  }
}
