import { MigrationInterface, QueryRunner } from 'typeorm';

export class LineItemVat1730000018000 implements MigrationInterface {
  name = 'LineItemVat1730000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        ADD COLUMN IF NOT EXISTS vat numeric(18,6) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        DROP COLUMN IF EXISTS vat;
    `);
  }
}
