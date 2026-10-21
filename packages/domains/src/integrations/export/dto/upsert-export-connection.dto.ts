import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpsertExportConnectionDto {
  @IsIn(['mock', 'live'])
  mode!: 'mock' | 'live';

  @ValidateIf((o: UpsertExportConnectionDto) => o.mode === 'live')
  @IsString()
  @MaxLength(1024)
  baseUrl?: string;

  /** Omit or leave blank to keep the existing API key. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  /** Omit or leave blank to keep the existing password. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;

  @IsOptional()
  @IsBoolean()
  clearPassword?: boolean;

  /** TotalCtrl inventory UUID for POST /orders/store-orders. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inventoryId?: string;

  /**
   * When true, Live create uses POST /partner/v1/orders/schedule
   * (inventory may come from Partner OAuth).
   */
  @IsOptional()
  @IsBoolean()
  usePartnerSchedule?: boolean;
}
