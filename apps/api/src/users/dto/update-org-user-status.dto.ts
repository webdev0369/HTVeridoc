import { IsEnum } from 'class-validator';
import { UserStatus } from '../../common/enums';

export class UpdateOrgUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
