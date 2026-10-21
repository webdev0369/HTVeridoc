import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Extraction } from './extraction.entity';

@Entity('extraction_sources')
@Index(['extractionId', 'targetType', 'targetId'])
export class ExtractionSource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'extraction_id', type: 'uuid' })
  extractionId!: string;

  @ManyToOne(() => Extraction, (extraction) => extraction.sources, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'extraction_id' })
  extraction!: Extraction;

  @Column({ name: 'target_type', type: 'varchar', length: 32 })
  targetType!: 'FIELD' | 'LINE_ITEM';

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ name: 'field_key', type: 'varchar', length: 128, nullable: true })
  fieldKey!: string | null;

  @Column({ type: 'int' })
  page!: number;

  @Column({
    name: 'bbox_x',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  bboxX!: string | null;

  @Column({
    name: 'bbox_y',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  bboxY!: string | null;

  @Column({
    name: 'bbox_width',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  bboxWidth!: string | null;

  @Column({
    name: 'bbox_height',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  bboxHeight!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
