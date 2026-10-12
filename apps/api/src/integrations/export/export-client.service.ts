import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import {
  ExportConnection,
  ExportConnectionMode,
} from './entities/export-connection.entity';
import { decryptSecret } from './secret-crypto';

export interface ResolvedExportConnection {
  organizationId: string;
  mode: ExportConnectionMode;
  baseUrl: string | null;
  apiKey: string | null;
  username: string | null;
  password: string | null;
  /** Always organization — SaaS credentials are never global env. */
  source: 'organization';
}

@Injectable()
export class ExportClientService {
  private readonly logger = new Logger(ExportClientService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ExportConnection)
    private readonly connectionsRepo: Repository<ExportConnection>,
  ) {}

  private appSecret(): string {
    return (
      this.config.get<string>('INTEGRATIONS_SECRET_KEY') ||
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
    );
  }

  /**
   * Load this organization's export-destination connection from the database.
   * No global env API keys — each org configures its own integration.
   */
  async resolveConnection(
    organizationId: string,
  ): Promise<ResolvedExportConnection> {
    const row = await this.connectionsRepo.findOne({
      where: { organizationId, isActive: true },
    });

    if (!row) {
      throw new Error(
        'Export destination is not configured for this organization. An admin must connect it under Settings → Export destination.',
      );
    }

    const secret = this.appSecret();
    return {
      organizationId,
      mode: row.mode,
      baseUrl: row.baseUrl,
      apiKey: decryptSecret(row.apiKey, secret),
      username: row.username,
      password: decryptSecret(row.password, secret),
      source: 'organization',
    };
  }

  /** Stable mock IDs so retries stay idempotent without a live destination API. */
  mockId(kind: string, ...parts: string[]): string {
    const digest = createHash('sha256')
      .update([kind, ...parts].join('|'))
      .digest('hex')
      .slice(0, 12);
    return `mock-${kind}-${digest}`;
  }

  async authenticate(connection: ResolvedExportConnection): Promise<void> {
    if (connection.mode === 'mock') {
      this.logger.debug(
        `Export sandbox auth ok for org ${connection.organizationId}`,
      );
      return;
    }

    if (!connection.baseUrl) {
      throw new Error('Live export mode requires a base URL');
    }
    if (!connection.apiKey && !(connection.username && connection.password)) {
      throw new Error(
        'Live export mode requires an API key or username/password',
      );
    }

    const url = `${connection.baseUrl.replace(/\/$/, '')}/health`;
    try {
      const headers = this.buildAuthHeaders(connection);
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Export auth/health returned HTTP ${res.status}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('HTTP')) {
        throw err;
      }
      this.logger.warn(
        `Export health check skipped/failed (${err instanceof Error ? err.message : 'error'}); proceeding with org credentials`,
      );
    }
  }

  buildAuthHeaders(
    connection: ResolvedExportConnection,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (connection.apiKey) {
      headers.Authorization = `Bearer ${connection.apiKey}`;
    } else if (connection.username && connection.password) {
      const token = Buffer.from(
        `${connection.username}:${connection.password}`,
      ).toString('base64');
      headers.Authorization = `Basic ${token}`;
    }
    return headers;
  }

  async request<T>(
    connection: ResolvedExportConnection,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (connection.mode === 'mock') {
      throw new Error('request() is only for live export mode');
    }
    if (!connection.baseUrl) {
      throw new Error('Export destination base URL missing');
    }

    const url = `${connection.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      method,
      headers: this.buildAuthHeaders(connection),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Export ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }

    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }
}
