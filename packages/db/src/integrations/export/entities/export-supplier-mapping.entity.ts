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
import { Organization } from '../../../organizations/entities/organization.entity';

@Entity('export_supplier_mappings')
@Unique(['organizationId', 'externalSupplierKey'])
@Index(['organizationId'])
export class ExportSupplierMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  /** Normalized supplier name / key from the PDF */
  @Column({ name: 'external_supplier_key', type: 'varchar', length: 512 })
  externalSupplierKey!: string;

  @Column({ name: 'destination_supplier_id', type: 'varchar', length: 128 })
  destinationSupplierId!: string;

  @Column({
    name: 'destination_supplier_name',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  destinationSupplierName!: string | null;

  @Column({ name: 'match_method', type: 'varchar', length: 64, default: 'manual' })
  matchMethod!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
