import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentType } from '@htveridoc/shared';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * Remembers a human correction: when AI extracts `fromValue` for `fieldKey`,
 * prefer `toValue` on future documents of the same org + document type.
 */
@Entity('organization_field_corrections')
@Unique(['organizationId', 'documentType', 'fieldKey', 'fromValue'])
@Index(['organizationId', 'documentType', 'fieldKey'])
export class OrganizationFieldCorrection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'document_type', type: 'varchar', length: 64 })
  documentType!: DocumentType;

  @Column({ name: 'field_key', type: 'varchar', length: 128 })
  fieldKey!: string;

  /** Normalized AI / previous value that should be replaced */
  @Column({ name: 'from_value', type: 'text' })
  fromValue!: string;

  /** Value the reviewer saved */
  @Column({ name: 'to_value', type: 'text' })
  toValue!: string;

  @Column({ name: 'hit_count', type: 'int', default: 1 })
  hitCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
