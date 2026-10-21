import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import {
  decryptSecret,
  encryptSecret,
} from '../export/secret-crypto';
import { UpsertWebhookDto } from './dto/upsert-webhook.dto';
import { WebhookEndpoint } from '@htveridoc/db/integrations/handoff/entities/webhook-endpoint.entity';

export interface WebhookEndpointPublicDto {
  configured: boolean;
  url: string | null;
  hasSecret: boolean;
  isActive: boolean;
  updatedAt: string | null;
}

export interface WebhookUpsertResult extends WebhookEndpointPublicDto {
  /** Present only when a new secret was created on this save — show once. */
  generatedSecret?: string;
}

export interface RotateSecretResult {
  /** Plaintext signing secret — shown once; store in partner BE env. */
  secret: string;
  webhook: WebhookEndpointPublicDto;
}

@Injectable()
export class WebhookEndpointService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(WebhookEndpoint)
    private readonly repo: Repository<WebhookEndpoint>,
  ) {}

  private appSecret(): string {
    return (
      this.config.get<string>('INTEGRATIONS_SECRET_KEY') ||
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
    );
  }

  async getPublic(organizationId: string): Promise<WebhookEndpointPublicDto> {
    const row = await this.repo.findOne({ where: { organizationId } });
    if (!row) {
      return {
        configured: false,
        url: null,
        hasSecret: false,
        isActive: false,
        updatedAt: null,
      };
    }
    return {
      configured: Boolean(row.url?.trim()),
      url: row.url?.trim() ? row.url : null,
      hasSecret: Boolean(row.secret),
      isActive: row.isActive && Boolean(row.url?.trim()),
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  async upsert(
    organizationId: string,
    dto: UpsertWebhookDto,
  ): Promise<WebhookUpsertResult> {
    const url = dto.url.trim();
    if (!url) {
      throw new BadRequestException('Webhook URL is required');
    }

    let row = await this.repo.findOne({ where: { organizationId } });
    if (!row) {
      row = this.repo.create({
        organizationId,
        url,
        secret: null,
        isActive: dto.isActive ?? true,
      });
    }

    row.url = url;
    row.isActive = dto.isActive ?? true;

    let generatedSecret: string | undefined;
    if (dto.clearSecret) {
      row.secret = null;
    } else if (dto.secret != null && dto.secret.trim() !== '') {
      row.secret = encryptSecret(dto.secret.trim(), this.appSecret());
    } else if (!row.secret) {
      // Auto-generate a signing secret on first save when none provided.
      generatedSecret = randomBytes(32).toString('base64url');
      row.secret = encryptSecret(generatedSecret, this.appSecret());
    }

    await this.repo.save(row);
    return {
      ...(await this.getPublic(organizationId)),
      ...(generatedSecret ? { generatedSecret } : {}),
    };
  }

  /**
   * Generate a new webhook signing secret (Stripe-style).
   * Plaintext is returned once; only the encrypted form is stored.
   */
  async rotateSecret(organizationId: string): Promise<RotateSecretResult> {
    const plaintext = randomBytes(32).toString('base64url');
    let row = await this.repo.findOne({ where: { organizationId } });
    if (!row) {
      // Secret can be created before receiver URL; webhook stays inactive.
      row = this.repo.create({
        organizationId,
        url: '',
        secret: encryptSecret(plaintext, this.appSecret()),
        isActive: false,
      });
    } else {
      row.secret = encryptSecret(plaintext, this.appSecret());
    }
    await this.repo.save(row);
    return {
      secret: plaintext,
      webhook: await this.getPublic(organizationId),
    };
  }

  async disable(organizationId: string): Promise<WebhookEndpointPublicDto> {
    const row = await this.repo.findOne({ where: { organizationId } });
    if (!row) {
      throw new NotFoundException('Webhook endpoint not configured');
    }
    row.isActive = false;
    await this.repo.save(row);
    return this.getPublic(organizationId);
  }

  async resolveActive(organizationId: string): Promise<{
    url: string;
    secret: string | null;
  } | null> {
    const row = await this.repo.findOne({ where: { organizationId } });
    if (!row?.isActive || !row.url?.trim()) return null;
    return {
      url: row.url,
      secret: decryptSecret(row.secret, this.appSecret()),
    };
  }

  async test(organizationId: string) {
    const endpoint = await this.resolveActive(organizationId);
    if (!endpoint) {
      throw new BadRequestException(
        'Save an active webhook URL first, then test again.',
      );
    }

    const body = {
      event: 'webhook.test',
      occurredAt: new Date().toISOString(),
      organizationId,
      message: 'HTVeriDoc webhook connectivity test',
    };
    const raw = JSON.stringify(body);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'HTVeriDoc-Webhook/1.0',
      'X-HTVeriDoc-Event': 'webhook.test',
    };
    if (endpoint.secret) {
      headers['X-HTVeriDoc-Signature'] = createHmac('sha256', endpoint.secret)
        .update(raw)
        .digest('hex');
    }

    let res: Response;
    try {
      res = await fetch(endpoint.url, {
        method: 'POST',
        headers,
        body: raw,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'network error';
      throw new BadRequestException(
        `Webhook test could not reach receiver (${endpoint.url}): ${detail}`,
      );
    }

    if (!res.ok) {
      const bodyPreview = (await res.text().catch(() => '')).slice(0, 120);
      throw new BadRequestException(
        `Webhook test failed: receiver returned HTTP ${res.status} for ${endpoint.url}.${
          bodyPreview ? ` Response: ${bodyPreview}` : ''
        } The path may be wrong, or TotalCtrl/socket has no HTVeriDoc route yet.`,
      );
    }

    return {
      ok: true,
      message: `Webhook test delivered (HTTP ${res.status})`,
    };
  }
}
