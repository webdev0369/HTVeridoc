import { MigrationInterface, QueryRunner } from 'typeorm';

export class PreferLitersAndBaseContent1730000014000
  implements MigrationInterface
{
  name = 'PreferLitersAndBaseContent1730000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
        ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
    `);
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        ADD COLUMN IF NOT EXISTS base_content_quantity numeric(18,6) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE extraction_line_items
        DROP COLUMN IF EXISTS base_content_quantity;
    `);
    await queryRunner.query(`
      ALTER TABLE organizations
        DROP COLUMN IF EXISTS settings;
    `);
  }
}
