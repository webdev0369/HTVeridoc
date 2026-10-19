import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLineItemDto {
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
  @MaxLength(32)
  lineType?: string | null;
}
