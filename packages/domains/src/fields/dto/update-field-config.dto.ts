import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DocumentType, FieldMode } from '@htveridoc/shared';

export class FieldConfigItemDto {
  @IsString()
  @MaxLength(128)
  fieldKey!: string;

  @IsEnum(FieldMode)
  mode!: FieldMode;
}

export class UpdateFieldConfigDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FieldConfigItemDto)
  fields!: FieldConfigItemDto[];
}
