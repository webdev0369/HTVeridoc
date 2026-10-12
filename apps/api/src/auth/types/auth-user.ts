import { PermissionCode, RoleCode } from '../../common/enums';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  role: RoleCode;
  permissions: PermissionCode[];
}
