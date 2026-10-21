import { MigrationInterface, QueryRunner } from 'typeorm';

export class StocktakingUnitPrice1730000008000 implements MigrationInterface {
  name = 'StocktakingUnitPrice1730000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        ADD COLUMN IF NOT EXISTS stocktaking_unit_price numeric(18,6) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        DROP COLUMN IF EXISTS stocktaking_unit_price;
    `);
  }
}
