import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RoleCode } from '../../common/enums';

export class CreateOrgUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  /** Required when creating a brand-new user; ignored if email already exists. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsEnum(RoleCode)
  role!: RoleCode;
}
