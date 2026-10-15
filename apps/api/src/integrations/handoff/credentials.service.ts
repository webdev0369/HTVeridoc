import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../auth/types/auth-user';
import { Organization } from '../../organizations/entities/organization.entity';
import { WebhookEndpointService } from './webhook-endpoint.service';

export interface IntegrationCredentialsDto {
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
  apiBaseUrl: string;
  webOrigin: string;
  auth: {
    method: 'jwt';
    loginPath: '/auth/login';
    note: string;
    currentUserEmail: string;
  };
  webhook: {
    configured: boolean;
    url: string | null;
    hasSecret: boolean;
    isActive: boolean;
    updatedAt: string | null;
  };
  /** Ready-to-paste block for partner BE .env (secret placeholder). */
  partnerEnvTemplate: string;
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly config: ConfigService,
    private readonly webhooks: WebhookEndpointService,
    @InjectRepository(Organization)
    private readonly orgsRepo: Repository<Organization>,
  ) {}

  async getForOrganization(
    organizationId: string,
    user: AuthUser,
  ): Promise<IntegrationCredentialsDto> {
    const org = await this.orgsRepo.findOne({ where: { id: organizationId } });
    const webhook = await this.webhooks.getPublic(organizationId);
    const apiPort = this.config.get<number>('API_PORT', 3001);
    const apiBaseUrl = (
      this.config.get<string>('PUBLIC_API_URL') ||
      `http://localhost:${apiPort}`
    ).replace(/\/$/, '');
    const webOrigin = (
      this.config.get<string>('PUBLIC_WEB_URL') ||
      this.config.get<string>('CORS_ORIGIN') ||
      'http://localhost:3000'
    )
      .split(',')[0]
      .trim()
      .replace(/\/$/, '');

    const partnerEnvTemplate = [
      `# HTVeriDoc — partner backend env (server only, never put in FE)`,
      `HTVERIDOC_API_URL=${apiBaseUrl}`,
      `HTVERIDOC_EMAIL=<integration-user@your-company.com>`,
      `HTVERIDOC_PASSWORD=<password>`,
      `HTVERIDOC_ORGANIZATION_ID=${organizationId}`,
      `HTVERIDOC_WEBHOOK_SECRET=<generate on Integration credentials page>`,
    ].join('\n');

    return {
      organizationId,
      organizationName: org?.name ?? 'Organization',
      organizationSlug: org?.slug ?? null,
      apiBaseUrl,
      webOrigin,
      auth: {
        method: 'jwt',
        loginPath: '/auth/login',
        note: 'Create a dedicated integration user under Users & Roles (recommended). Your backend logs in with email/password and keeps the JWT server-side.',
        currentUserEmail: user.email,
      },
      webhook: {
        configured: webhook.configured,
        url: webhook.url,
        hasSecret: webhook.hasSecret,
        isActive: webhook.isActive,
        updatedAt: webhook.updatedAt,
      },
      partnerEnvTemplate,
    };
  }
}
