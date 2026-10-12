import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Extraction } from './extraction.entity';

@Entity('extraction_fields')
@Index(['extractionId', 'fieldKey'], { unique: true })
export class ExtractionField {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'extraction_id', type: 'uuid' })
  extractionId!: string;

  @ManyToOne(() => Extraction, (extraction) => extraction.fields, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'extraction_id' })
  extraction!: Extraction;

  @Column({ name: 'field_key', type: 'varchar', length: 128 })
  fieldKey!: string;

  @Column({ name: 'field_label', type: 'varchar', length: 255 })
  fieldLabel!: string;

  @Column({ name: 'original_value', type: 'text', nullable: true })
  originalValue!: string | null;

  @Column({ name: 'current_value', type: 'text', nullable: true })
  currentValue!: string | null;

  @Column({
    name: 'confidence',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  confidence!: string | null;

  @Column({ name: 'is_user_edited', type: 'boolean', default: false })
  isUserEdited!: boolean;

  @Column({ name: 'source_page', type: 'int', nullable: true })
  sourcePage!: number | null;

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

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
