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

@Entity('export_product_mappings')
@Unique(['organizationId', 'supplierKey', 'articleNumber'])
@Index(['organizationId', 'articleNumber'])
export class ExportProductMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  /** Normalized supplier key; empty string when not supplier-scoped */
  @Column({ name: 'supplier_key', type: 'varchar', length: 512, default: '' })
  supplierKey!: string;

  @Column({ name: 'article_number', type: 'varchar', length: 255 })
  articleNumber!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sku!: string | null;

  @Column({ name: 'destination_product_id', type: 'varchar', length: 128 })
  destinationProductId!: string;

  @Column({ name: 'match_method', type: 'varchar', length: 64, default: 'manual' })
  matchMethod!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
