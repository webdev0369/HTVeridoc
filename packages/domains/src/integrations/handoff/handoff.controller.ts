import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@htveridoc/shared/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@htveridoc/shared/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@htveridoc/shared/auth/guards/permissions.guard';
import { OrganizationId } from '@htveridoc/shared/common/decorators/organization-id.decorator';
import { RequirePermissions } from '@htveridoc/shared/common/decorators/permissions.decorator';
import { PermissionCode } from '@htveridoc/shared';
import { AuthUser } from '@htveridoc/shared/auth/types/auth-user';
import {
  CreateEditorLinkDto,
  UpsertWebhookDto,
} from './dto/upsert-webhook.dto';
import { CredentialsService } from './credentials.service';
import { EditorLinkService } from './editor-link.service';
import { WebhookEndpointService } from './webhook-endpoint.service';

@Controller('integrations/handoff')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HandoffController {
  constructor(
    private readonly webhooks: WebhookEndpointService,
    private readonly editorLinks: EditorLinkService,
    private readonly credentials: CredentialsService,
  ) {}

  @Get('credentials')
  @RequirePermissions(PermissionCode.INTEGRATION_READ)
  getCredentials(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.credentials.getForOrganization(organizationId, user);
  }

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

  @Post('webhook/rotate-secret')
  @RequirePermissions(PermissionCode.INTEGRATION_MANAGE)
  rotateWebhookSecret(@OrganizationId() organizationId: string) {
    return this.webhooks.rotateSecret(organizationId);
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
