import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/enums';
import { AuthUser } from '../auth/types/auth-user';
import { CreateOrgUserDto } from './dto/create-org-user.dto';
import { UpdateOrgUserRoleDto } from './dto/update-org-user-role.dto';
import { UpdateOrgUserStatusDto } from './dto/update-org-user-status.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(PermissionCode.USER_READ)
  list(@OrganizationId() organizationId: string) {
    return this.usersService.listByOrganization(organizationId);
  }

  @Get('roles')
  @RequirePermissions(PermissionCode.USER_READ)
  roles() {
    return this.usersService.listRoles();
  }

  @Post()
  @RequirePermissions(PermissionCode.USER_MANAGE)
  create(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrgUserDto,
  ) {
    return this.usersService.createInOrganization(
      organizationId,
      user.userId,
      dto,
    );
  }

  @Patch(':id/role')
  @RequirePermissions(PermissionCode.USER_MANAGE)
  updateRole(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgUserRoleDto,
  ) {
    return this.usersService.updateRole(
      organizationId,
      user.userId,
      id,
      dto,
    );
  }

  @Patch(':id/status')
  @RequirePermissions(PermissionCode.USER_MANAGE)
  updateStatus(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgUserStatusDto,
  ) {
    return this.usersService.updateStatus(
      organizationId,
      user.userId,
      id,
      dto,
    );
  }
}
