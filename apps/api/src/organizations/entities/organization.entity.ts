import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizationUser } from '../../users/entities/organization-user.entity';
import type {
  CustomLineItemFeature,
  LineItemDocumentConfig,
} from '../line-item-config';

export interface OrganizationSettings {
  /**
   * Per document type: line-item column modes + features
   * (e.g. normalizeVolumeToLiters on base unit).
   */
  lineItemConfigByDocumentType: Record<string, LineItemDocumentConfig>;
  /** Org-defined features that can be attached to any line column. */
  customLineItemFeatures?: CustomLineItemFeature[];
  /** @deprecated Migrated into lineItemConfigByDocumentType features. */
  preferLitersByDocumentType?: Record<string, boolean>;
  /** @deprecated Prefer lineItemConfigByDocumentType. */
  preferLitersForVolumeBase?: boolean;
}

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  /** Org-level extraction / display preferences. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings!: OrganizationSettings;

  @OneToMany(() => OrganizationUser, (membership) => membership.organization)
  memberships!: OrganizationUser[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
