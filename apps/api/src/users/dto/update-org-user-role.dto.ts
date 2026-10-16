import { IsEnum } from 'class-validator';
import { RoleCode } from '../../common/enums';

export class UpdateOrgUserRoleDto {
  @IsEnum(RoleCode)
  role!: RoleCode;
}
