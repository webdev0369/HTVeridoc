import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { DocumentValidationError } from './document-validation-error.entity';

@Entity('validation_results')
@Index(['documentId'], { unique: true })
export class ValidationResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'extraction_id', type: 'uuid', nullable: true })
  extractionId!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: 'pending' | 'passed' | 'passed_with_warnings' | 'failed';

  @Column({ name: 'error_count', type: 'int', default: 0 })
  errorCount!: number;

  @Column({ name: 'warning_count', type: 'int', default: 0 })
  warningCount!: number;

  /** String relation target avoids a runtime circular import. */
  @OneToMany('DocumentValidationError', 'validationResult')
  errors!: DocumentValidationError[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
