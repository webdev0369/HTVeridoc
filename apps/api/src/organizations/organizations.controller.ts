import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/enums';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('current')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  current(@OrganizationId() organizationId: string) {
    return this.organizationsService.findOne(organizationId);
  }

  @Patch('current/settings')
  @RequirePermissions(PermissionCode.FIELD_MANAGE)
  updateSettings(
    @OrganizationId() organizationId: string,
    @Body() body: UpdateOrganizationSettingsDto,
  ) {
    return this.organizationsService.updateSettings(organizationId, body);
  }
}
