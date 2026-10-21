import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentStatus, DocumentType } from '@htveridoc/shared';

@Entity('documents')
@Index(['organizationId', 'status'])
@Index(['organizationId', 'createdAt'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 512 })
  fileName!: string;

  @Column({ name: 'file_path', type: 'varchar', length: 1024 })
  filePath!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 128 })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize!: string;

  @Column({ type: 'varchar', length: 64 })
  sha256!: string;

  @Column({ name: 'page_count', type: 'int', default: 0 })
  pageCount!: number;

  @Column({
    name: 'document_type',
    type: 'varchar',
    length: 64,
    default: DocumentType.PURCHASE_ORDER_CONFIRMATION,
  })
  documentType!: DocumentType;

  /** Rossum-style document queue (null = unassigned / legacy). */
  @Column({ name: 'queue_id', type: 'uuid', nullable: true })
  @Index()
  queueId!: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    default: DocumentStatus.UPLOADED,
  })
  status!: DocumentStatus;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
