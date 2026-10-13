import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../../organizations/entities/organization.entity';

export type ExportConnectionMode = 'mock' | 'live';

@Entity('export_connections')
@Unique(['organizationId'])
export class ExportConnection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'base_url', type: 'varchar', length: 1024, nullable: true })
  baseUrl!: string | null;

  @Column({ name: 'api_key', type: 'text', nullable: true })
  apiKey!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username!: string | null;

  @Column({ type: 'text', nullable: true })
  password!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'mock' })
  mode!: ExportConnectionMode;

  /** TotalCtrl inventory UUID required for POST /orders/store-orders. */
  @Column({ name: 'inventory_id', type: 'varchar', length: 64, nullable: true })
  inventoryId!: string | null;

  /**
   * When true, Live create uses POST /partner/v1/orders/schedule
   * instead of /orders/store-orders.
   */
  @Column({
    name: 'use_partner_schedule',
    type: 'boolean',
    default: false,
  })
  usePartnerSchedule!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
