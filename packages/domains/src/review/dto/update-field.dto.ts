import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  currentValue?: string | null;
}
