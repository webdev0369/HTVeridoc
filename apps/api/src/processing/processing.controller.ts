import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/enums';
import { ProcessingService } from './processing.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProcessingController {
  constructor(private readonly processingService: ProcessingService) {}

  @Post(':id/process')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  process(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.processingService.enqueueExtraction(organizationId, id);
  }
}
