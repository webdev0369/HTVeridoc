import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExtractionField } from './extraction-field.entity';
import { ExtractionLineItem } from './extraction-line-item.entity';
import { ExtractionSource } from './extraction-source.entity';

@Entity('extractions')
@Index(['documentId'], { unique: true })
@Index(['organizationId', 'createdAt'])
export class Extraction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: 'pending' | 'completed' | 'failed';

  @Column({ type: 'varchar', length: 128, nullable: true })
  model!: string | null;

  @Column({ name: 'prompt_version', type: 'varchar', length: 32, nullable: true })
  promptVersion!: string | null;

  @Column({ name: 'schema_version', type: 'varchar', length: 32, nullable: true })
  schemaVersion!: string | null;

  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse!: Record<string, unknown> | null;

  @Column({ name: 'structured_data', type: 'jsonb', nullable: true })
  structuredData!: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'processing_time_ms', type: 'int', nullable: true })
  processingTimeMs!: number | null;

  @OneToMany(() => ExtractionField, (field) => field.extraction)
  fields!: ExtractionField[];

  @OneToMany(() => ExtractionLineItem, (line) => line.extraction)
  lineItems!: ExtractionLineItem[];

  @OneToMany(() => ExtractionSource, (source) => source.extraction)
  sources!: ExtractionSource[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
