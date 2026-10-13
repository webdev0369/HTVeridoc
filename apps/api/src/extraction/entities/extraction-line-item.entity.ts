import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Extraction } from './extraction.entity';

@Entity('extraction_line_items')
@Index(['extractionId', 'sortOrder'])
export class ExtractionLineItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'extraction_id', type: 'uuid' })
  extractionId!: string;

  @ManyToOne(() => Extraction, (extraction) => extraction.lineItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'extraction_id' })
  extraction!: Extraction;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'int', nullable: true })
  position!: number | null;

  @Column({ name: 'article_number', type: 'varchar', length: 255, nullable: true })
  articleNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand!: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  quantity!: string | null;

  /** Ordered quantity in purchase-unit terms. */
  @Column({
    name: 'purchase_quantity',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  purchaseQuantity!: string | null;

  /** Ordered quantity in stocktaking-unit terms. */
  @Column({
    name: 'stock_taking_quantity',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  stockTakingQuantity!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  packaging!: string | null;

  @Column({
    name: 'package_quantity',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  packageQuantity!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  unit!: string | null;

  @Column({ name: 'purchase_unit', type: 'varchar', length: 64, nullable: true })
  purchaseUnit!: string | null;

  @Column({
    name: 'stocktaking_unit',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  stocktakingUnit!: string | null;

  @Column({
    name: 'stock_taking_qty_per_purchase_unit',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  stockTakingQuantityPerPurchaseUnit!: string | null;

  @Column({
    name: 'base_measurement_unit',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  baseMeasurementUnit!: string | null;

  /**
   * Content of one stocktaking unit expressed in baseMeasurementUnit
   * (e.g. 750 when base is ML, or 0.75 when prefer-liters converts to L).
   */
  @Column({
    name: 'base_content_quantity',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  baseContentQuantity!: string | null;

  /** Price per base measurement unit when shown on the document. */
  @Column({
    name: 'price_per_base_unit',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  pricePerBaseUnit!: string | null;

  /** How many stocktaking units equal one base measurement unit (when units differ). */
  @Column({
    name: 'stock_taking_qty_per_base_unit',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  stockTakingQuantityPerBaseMeasurementUnit!: string | null;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  unitPrice!: string | null;

  @Column({
    name: 'stocktaking_unit_price',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  stocktakingUnitPrice!: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  discount!: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
  })
  amount!: string | null;

  @Column({
    name: 'expected_delivery',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  expectedDelivery!: string | null;

  @Column({ name: 'line_type', type: 'varchar', length: 32, default: 'UNKNOWN' })
  lineType!: string;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  confidence!: string | null;

  @Column({ name: 'source_page', type: 'int', nullable: true })
  sourcePage!: number | null;

  @Column({
    name: 'bbox_x',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  bboxX!: string | null;

  @Column({
    name: 'bbox_y',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  bboxY!: string | null;

  @Column({
    name: 'bbox_width',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  bboxWidth!: string | null;

  @Column({
    name: 'bbox_height',
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  bboxHeight!: string | null;

  @Column({ name: 'is_user_edited', type: 'boolean', default: false })
  isUserEdited!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
