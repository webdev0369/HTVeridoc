import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { OrganizationId } from '../../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionCode } from '../../common/enums';
import { DocumentExportService } from './document-export.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentExportController {
  constructor(private readonly documentExport: DocumentExportService) {}

  @Get(':id/export')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  getStatus(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentExport.getStatus(organizationId, id);
  }

  @Get(':id/export/match')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  previewMatch(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentExport.previewMatch(organizationId, id);
  }

  @Post(':id/export/retry')
  @RequirePermissions(PermissionCode.DOCUMENT_APPROVE)
  retry(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentExport.retryExport(organizationId, id);
  }
}
