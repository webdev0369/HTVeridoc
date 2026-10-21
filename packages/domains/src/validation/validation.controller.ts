import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@htveridoc/shared/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@htveridoc/shared/auth/guards/permissions.guard';
import { OrganizationId } from '@htveridoc/shared/common/decorators/organization-id.decorator';
import { RequirePermissions } from '@htveridoc/shared/common/decorators/permissions.decorator';
import { PermissionCode } from '@htveridoc/shared';
import { ValidationService } from './validation.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ValidationController {
  constructor(private readonly validationService: ValidationService) {}

  @Get(':id/validation')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  getValidation(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.validationService.getByDocument(organizationId, id);
  }

  @Post(':id/validate')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  validate(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.validationService.validateDocument(id, organizationId);
  }
}
