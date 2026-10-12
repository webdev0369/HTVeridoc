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
import { Document } from '../../../documents/entities/document.entity';
import { Organization } from '../../../organizations/entities/organization.entity';

export type ExportPoStatus =
  | 'pending'
  | 'exporting'
  | 'exported'
  | 'failed';

@Entity('export_po_mappings')
@Unique(['documentId'])
@Index(['organizationId', 'exportStatus'])
export class ExportPoMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: Document;

  @Column({
    name: 'external_po_number',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  externalPoNumber!: string | null;

  @Column({ name: 'destination_po_id', type: 'varchar', length: 128, nullable: true })
  destinationPoId!: string | null;

  @Column({ name: 'export_status', type: 'varchar', length: 32, default: 'pending' })
  exportStatus!: ExportPoStatus;

  @Column({ name: 'match_summary', type: 'jsonb', nullable: true })
  matchSummary!: Record<string, unknown> | null;

  @Column({ name: 'export_payload', type: 'jsonb', nullable: true })
  exportPayload!: Record<string, unknown> | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'exported_at', type: 'timestamptz', nullable: true })
  exportedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
