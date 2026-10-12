import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtractionStructured1730000002000 implements MigrationInterface {
  name = 'ExtractionStructured1730000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS extraction_fields (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        extraction_id uuid NOT NULL REFERENCES extractions(id) ON DELETE CASCADE,
        field_key varchar(128) NOT NULL,
        field_label varchar(255) NOT NULL,
        original_value text NULL,
        current_value text NULL,
        confidence numeric(5,4) NULL,
        is_user_edited boolean NOT NULL DEFAULT false,
        source_page int NULL,
        bbox_x numeric(12,6) NULL,
        bbox_y numeric(12,6) NULL,
        bbox_width numeric(12,6) NULL,
        bbox_height numeric(12,6) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (extraction_id, field_key)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS extraction_line_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        extraction_id uuid NOT NULL REFERENCES extractions(id) ON DELETE CASCADE,
        sort_order int NOT NULL DEFAULT 0,
        position int NULL,
        article_number varchar(255) NULL,
        description text NULL,
        brand varchar(255) NULL,
        quantity numeric(18,6) NULL,
        packaging varchar(128) NULL,
        package_quantity numeric(18,6) NULL,
        unit varchar(64) NULL,
        unit_price numeric(18,6) NULL,
        discount numeric(18,6) NULL,
        amount numeric(18,6) NULL,
        expected_delivery varchar(64) NULL,
        line_type varchar(32) NOT NULL DEFAULT 'UNKNOWN',
        confidence numeric(5,4) NULL,
        source_page int NULL,
        bbox_x numeric(12,6) NULL,
        bbox_y numeric(12,6) NULL,
        bbox_width numeric(12,6) NULL,
        bbox_height numeric(12,6) NULL,
        is_user_edited boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_extraction_line_items_sort
      ON extraction_line_items (extraction_id, sort_order);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS extraction_sources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        extraction_id uuid NOT NULL REFERENCES extractions(id) ON DELETE CASCADE,
        target_type varchar(32) NOT NULL,
        target_id uuid NOT NULL,
        field_key varchar(128) NULL,
        page int NOT NULL,
        bbox_x numeric(12,6) NULL,
        bbox_y numeric(12,6) NULL,
        bbox_width numeric(12,6) NULL,
        bbox_height numeric(12,6) NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_extraction_sources_target
      ON extraction_sources (extraction_id, target_type, target_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS extraction_sources;`);
    await queryRunner.query(`DROP TABLE IF EXISTS extraction_line_items;`);
    await queryRunner.query(`DROP TABLE IF EXISTS extraction_fields;`);
  }
}
