import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { UpdateLineItemDto } from './update-line-item.dto';

export class BatchFieldUpdateDto {
  @IsUUID()
  fieldId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  currentValue?: string | null;
}

export class BatchLineItemUpdateDto extends UpdateLineItemDto {
  @IsUUID()
  lineItemId!: string;
}

/** One request to apply many field + line cell edits from review. */
export class BatchUpdateExtractionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchFieldUpdateDto)
  fields?: BatchFieldUpdateDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchLineItemUpdateDto)
  lineItems?: BatchLineItemUpdateDto[];
}
