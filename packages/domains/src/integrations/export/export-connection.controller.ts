import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@htveridoc/shared/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@htveridoc/shared/auth/guards/permissions.guard';
import { OrganizationId } from '@htveridoc/shared/common/decorators/organization-id.decorator';
import { RequirePermissions } from '@htveridoc/shared/common/decorators/permissions.decorator';
import { PermissionCode } from '@htveridoc/shared';
import { ExportConnectionService } from './export-connection.service';
import { UpsertExportConnectionDto } from './dto/upsert-export-connection.dto';

@Controller('integrations/export')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExportConnectionController {
  constructor(private readonly connections: ExportConnectionService) {}

  @Get('connection')
  @RequirePermissions(PermissionCode.INTEGRATION_READ)
  get(@OrganizationId() organizationId: string) {
    return this.connections.getPublic(organizationId);
  }

  @Put('connection')
  @RequirePermissions(PermissionCode.INTEGRATION_MANAGE)
  upsert(
    @OrganizationId() organizationId: string,
    @Body() dto: UpsertExportConnectionDto,
  ) {
    return this.connections.upsert(organizationId, dto);
  }

  @Post('connection/test')
  @RequirePermissions(PermissionCode.INTEGRATION_MANAGE)
  test(@OrganizationId() organizationId: string) {
    return this.connections.test(organizationId);
  }

  @Delete('connection')
  @RequirePermissions(PermissionCode.INTEGRATION_MANAGE)
  disable(@OrganizationId() organizationId: string) {
    return this.connections.disable(organizationId);
  }
}
