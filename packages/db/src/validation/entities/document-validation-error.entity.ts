import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ValidationResult } from './validation-result.entity';

@Entity('validation_errors')
@Index(['validationResultId'])
export class DocumentValidationError {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'validation_result_id', type: 'uuid' })
  validationResultId!: string;

  /** String relation target avoids a runtime circular import with ValidationResult. */
  @ManyToOne('ValidationResult', 'errors', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'validation_result_id' })
  validationResult!: ValidationResult;

  @Column({ type: 'varchar', length: 16 })
  severity!: 'error' | 'warning';

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ name: 'field_key', type: 'varchar', length: 128, nullable: true })
  fieldKey!: string | null;

  @Column({ name: 'line_item_id', type: 'uuid', nullable: true })
  lineItemId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
