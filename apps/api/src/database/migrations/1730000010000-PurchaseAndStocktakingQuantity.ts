import { MigrationInterface, QueryRunner } from 'typeorm';

export class PurchaseAndStocktakingQuantity1730000010000
  implements MigrationInterface
{
  name = 'PurchaseAndStocktakingQuantity1730000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        ADD COLUMN IF NOT EXISTS purchase_quantity numeric(18,6) NULL,
        ADD COLUMN IF NOT EXISTS stock_taking_quantity numeric(18,6) NULL;
    `);
    // Backfill purchase qty from legacy quantity column.
    await queryRunner.query(`
      UPDATE extraction_line_items
      SET purchase_quantity = quantity
      WHERE purchase_quantity IS NULL AND quantity IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        DROP COLUMN IF EXISTS stock_taking_quantity,
        DROP COLUMN IF EXISTS purchase_quantity;
    `);
  }
}
