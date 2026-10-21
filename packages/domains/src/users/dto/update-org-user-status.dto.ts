import { IsEnum } from 'class-validator';
import { UserStatus } from '@htveridoc/shared';

export class UpdateOrgUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
