import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import {
  ExportConnection,
  ExportConnectionMode,
} from './entities/export-connection.entity';
import { EXPORT_PATHS } from './export-contract';
import { decryptSecret } from './secret-crypto';

export interface ResolvedExportConnection {
  organizationId: string;
  mode: ExportConnectionMode;
  baseUrl: string | null;
  apiKey: string | null;
  username: string | null;
  password: string | null;
  /** TotalCtrl inventory UUID for POST /orders/store-orders. */
  inventoryId: string | null;
  /**
   * When true, create via POST /partner/v1/orders/schedule
   * (supplier/inventory may come from Partner OAuth).
   */
  usePartnerSchedule: boolean;
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
      where: { organizationId },
    });

    if (!row) {
      throw new NotFoundException(
        'Export destination is not configured for this organization. Save a Sandbox or Live connection under Settings → Export destination, then try again.',
      );
    }

    if (!row.isActive) {
      throw new BadRequestException(
        'Export destination is disabled for this organization. Turn on “Connection active” under Settings → Export destination (or Save connection with it checked), then test again.',
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
      inventoryId: row.inventoryId ?? null,
      usePartnerSchedule: Boolean(row.usePartnerSchedule),
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

  /**
   * Verify Live credentials against the destination contract.
   * Sandbox always succeeds without HTTP.
   */
  async authenticate(connection: ResolvedExportConnection): Promise<void> {
    if (connection.mode === 'mock') {
      this.logger.debug(
        `Export sandbox auth ok for org ${connection.organizationId}`,
      );
      return;
    }

    if (!connection.baseUrl) {
      throw new BadRequestException('Live export mode requires a base URL');
    }
    if (!connection.apiKey && !(connection.username && connection.password)) {
      throw new BadRequestException(
        'Live export mode requires an API key or username/password',
      );
    }

    const headers = this.buildAuthHeaders(connection);
    const base = connection.baseUrl.replace(/\/$/, '');
    const candidates = [
      `${base}${EXPORT_PATHS.health}`,
      `${base}${EXPORT_PATHS.healthReady}`,
    ];

    let lastError: Error | null = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        // 2xx / 401 (reachable + auth challenge) / 404 try next
        if (res.ok) return;
        if (res.status === 401 || res.status === 403) {
          throw new BadRequestException(
            `Export destination rejected credentials (HTTP ${res.status}). Check API key / secret.`,
          );
        }
        if (res.status === 404) {
          lastError = new Error(`HTTP 404 at ${url}`);
          continue;
        }
        throw new BadRequestException(
          `Export auth check returned HTTP ${res.status}`,
        );
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        lastError = err instanceof Error ? err : new Error('auth check failed');
      }
    }

    // Reachable host not required to expose health — credentials format OK.
    this.logger.warn(
      `Export health endpoints unavailable (${lastError?.message ?? 'error'}); accepting Live credentials for org ${connection.organizationId}`,
    );
  }

  /**
   * TotalCtrl-style: Bearer API key + optional X-Api-Secret,
   * or Basic username/password when no API key.
   */
  buildAuthHeaders(
    connection: ResolvedExportConnection,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (connection.apiKey) {
      headers.Authorization = `Bearer ${connection.apiKey}`;
      if (connection.password) {
        headers['X-Api-Secret'] = connection.password;
      }
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
