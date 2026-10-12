import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const LINE_COLUMNS = [
  'articleNumber',
  'description',
  'purchaseUnit',
  'purchaseQuantity',
  'unitPrice',
  'stocktakingUnit',
  'stockTakingQuantity',
  'stocktakingUnitPrice',
  'stockTakingQuantityPerPurchaseUnit',
  'baseMeasurementUnit',
  'pricePerBaseUnit',
  'stockTakingQuantityPerBaseMeasurementUnit',
  'discount',
  'amount',
] as const;

export class BulkLineColumnValueDto {
  @IsUUID()
  lineItemId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  value?: string | null;
}

export class BulkUpdateLineColumnDto {
  @IsString()
  @IsIn([...LINE_COLUMNS])
  column!: (typeof LINE_COLUMNS)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkLineColumnValueDto)
  values!: BulkLineColumnValueDto[];
}
