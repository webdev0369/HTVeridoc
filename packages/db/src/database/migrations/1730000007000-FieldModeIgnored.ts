import { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldModeIgnored1730000007000 implements MigrationInterface {
  name = 'FieldModeIgnored1730000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE organization_document_field_config
      SET mode = 'IGNORED'
      WHERE mode = 'HIDDEN';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE organization_document_field_config
      SET mode = 'HIDDEN'
      WHERE mode = 'IGNORED';
    `);
  }
}
