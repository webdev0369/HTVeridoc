import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FieldMode } from '@htveridoc/shared';

class LineItemColumnConfigDto {
  @IsOptional()
  @IsIn(Object.values(FieldMode))
  mode?: FieldMode;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}

class LineItemDocumentConfigDto {
  @IsOptional()
  @IsObject()
  columns?: Record<string, LineItemColumnConfigDto>;
}

class CustomLineItemFeatureDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z][a-zA-Z0-9]*$/, {
    message: 'feature key must be camelCase starting with a letter',
  })
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label!: string;
}

export class UpdateOrganizationSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentType?: string;

  /**
   * Full or partial line-item config for documentType (merged into stored config).
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => LineItemDocumentConfigDto)
  lineItemConfig?: LineItemDocumentConfigDto;

  /** Register a new org-defined feature (available on all columns). */
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomLineItemFeatureDto)
  customFeature?: CustomLineItemFeatureDto;

  /**
   * Convenience: toggle normalizeVolumeToLiters for documentType
   * (updates baseMeasurementUnit + baseContentQuantity features).
   */
  @IsOptional()
  @IsBoolean()
  preferLitersForVolumeBase?: boolean;
}
