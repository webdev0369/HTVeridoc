import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLineItemDto {
  @IsOptional()
  @IsNumber()
  position?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  articleNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  quantity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  purchaseQuantity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stockTakingQuantity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  packaging?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  packageQuantity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  purchaseUnit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stocktakingUnit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stockTakingQuantityPerPurchaseUnit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  baseMeasurementUnit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  baseContentQuantity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  pricePerBaseUnit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stockTakingQuantityPerBaseMeasurementUnit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unitPrice?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stocktakingUnitPrice?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  discount?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  vat?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  amount?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  expectedDelivery?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  lineType?: string | null;
}
