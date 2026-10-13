import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { OrganizationId } from '../../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionCode } from '../../common/enums';
import {
  CreateEditorLinkDto,
  UpsertWebhookDto,
} from './dto/upsert-webhook.dto';
import { EditorLinkService } from './editor-link.service';
import { WebhookEndpointService } from './webhook-endpoint.service';

@Controller('integrations/handoff')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HandoffController {
  constructor(
    private readonly webhooks: WebhookEndpointService,
    private readonly editorLinks: EditorLinkService,
  ) {}

  @Get('webhook')
  @RequirePermissions(PermissionCode.INTEGRATION_READ)
  getWebhook(@OrganizationId() organizationId: string) {
    return this.webhooks.getPublic(organizationId);
  }

  @Put('webhook')
  @RequirePermissions(PermissionCode.INTEGRATION_MANAGE)
  upsertWebhook(
    @OrganizationId() organizationId: string,
    @Body() dto: UpsertWebhookDto,
  ) {
    return this.webhooks.upsert(organizationId, dto);
  }

  @Post('webhook/test')
  @RequirePermissions(PermissionCode.INTEGRATION_MANAGE)
  testWebhook(@OrganizationId() organizationId: string) {
    return this.webhooks.test(organizationId);
  }

  @Delete('webhook')
  @RequirePermissions(PermissionCode.INTEGRATION_MANAGE)
  disableWebhook(@OrganizationId() organizationId: string) {
    return this.webhooks.disable(organizationId);
  }

  @Post('editor-link')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  createEditorLink(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateEditorLinkDto,
  ) {
    return this.editorLinks.createLink(
      organizationId,
      dto.documentId,
      dto.expiresInSeconds,
    );
  }
}
