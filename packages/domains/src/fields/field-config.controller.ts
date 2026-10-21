import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@htveridoc/shared/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@htveridoc/shared/auth/guards/permissions.guard';
import { OrganizationId } from '@htveridoc/shared/common/decorators/organization-id.decorator';
import { RequirePermissions } from '@htveridoc/shared/common/decorators/permissions.decorator';
import { DocumentType, PermissionCode } from '@htveridoc/shared';
import { UpdateFieldConfigDto } from './dto/update-field-config.dto';
import { isConfigurableDocumentType } from './field-catalog';
import { FieldConfigService } from './field-config.service';

@Controller('field-config')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FieldConfigController {
  constructor(private readonly fieldConfigService: FieldConfigService) {}

  @Get('document-types')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  listTypes(@OrganizationId() organizationId: string) {
    return this.fieldConfigService.listDocumentTypes(organizationId);
  }

  @Get()
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  get(
    @OrganizationId() organizationId: string,
    @Query('documentType') documentType: string,
  ) {
    if (!documentType || !isConfigurableDocumentType(documentType)) {
      throw new BadRequestException(
        'Query documentType is required and must be a supported type',
      );
    }
    return this.fieldConfigService.getConfig(
      organizationId,
      documentType as DocumentType,
    );
  }

  @Put()
  @RequirePermissions(PermissionCode.FIELD_MANAGE)
  update(
    @OrganizationId() organizationId: string,
    @Body() dto: UpdateFieldConfigDto,
  ) {
    return this.fieldConfigService.replaceConfig(organizationId, dto);
  }

  @Post('reset')
  @RequirePermissions(PermissionCode.FIELD_MANAGE)
  reset(
    @OrganizationId() organizationId: string,
    @Query('documentType') documentType: string,
  ) {
    if (!documentType || !isConfigurableDocumentType(documentType)) {
      throw new BadRequestException(
        'Query documentType is required and must be a supported type',
      );
    }
    return this.fieldConfigService.resetConfig(
      organizationId,
      documentType as DocumentType,
    );
  }
}
