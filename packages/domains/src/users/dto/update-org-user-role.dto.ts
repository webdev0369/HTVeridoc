import { IsEnum } from 'class-validator';
import { RoleCode } from '@htveridoc/shared';

export class UpdateOrgUserRoleDto {
  @IsEnum(RoleCode)
  role!: RoleCode;
}
