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
import { DocumentType, FieldMode } from '../../common/enums';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity('organization_document_field_config')
@Unique(['organizationId', 'documentType', 'fieldKey'])
@Index(['organizationId', 'documentType'])
export class OrganizationDocumentFieldConfig {
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

  @Column({ type: 'varchar', length: 16 })
  mode!: FieldMode;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
