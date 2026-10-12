import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
