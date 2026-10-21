import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExportConnectionInventory1730000015000
  implements MigrationInterface
{
  name = 'ExportConnectionInventory1730000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE export_connections
        ADD COLUMN IF NOT EXISTS inventory_id varchar(64) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE export_connections
        ADD COLUMN IF NOT EXISTS use_partner_schedule boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE export_connections
        DROP COLUMN IF EXISTS use_partner_schedule
    `);
    await queryRunner.query(`
      ALTER TABLE export_connections
        DROP COLUMN IF EXISTS inventory_id
    `);
  }
}
