import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@htveridoc/shared/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@htveridoc/shared/auth/guards/permissions.guard';
import { OrganizationId } from '@htveridoc/shared/common/decorators/organization-id.decorator';
import { RequirePermissions } from '@htveridoc/shared/common/decorators/permissions.decorator';
import { PermissionCode } from '@htveridoc/shared';
import { ExtractionService } from './extraction.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExtractionController {
  constructor(private readonly extractionService: ExtractionService) {}

  @Get(':id/extraction')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  getExtraction(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.extractionService.getByDocument(organizationId, id);
  }

  @Get(':id/events')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  getEvents(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.extractionService.getEvents(organizationId, id);
  }
}
