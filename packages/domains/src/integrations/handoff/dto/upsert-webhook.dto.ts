import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertWebhookDto {
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url!: string;

  /** Omit or blank to keep existing secret. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  secret?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  clearSecret?: boolean;
}

export class CreateEditorLinkDto {
  @IsString()
  documentId!: string;

  /** Seconds until expiry (default 7 days, max 30 days). */
  @IsOptional()
  @IsInt()
  @Min(60)
  expiresInSeconds?: number;
}
