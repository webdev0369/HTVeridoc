import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpsertExportConnectionDto } from './dto/upsert-export-connection.dto';
import { ExportConnection } from './entities/export-connection.entity';
import { encryptSecret } from './secret-crypto';
import { ExportClientService } from './export-client.service';

export interface ExportConnectionPublicDto {
  configured: boolean;
  mode: 'mock' | 'live' | null;
  baseUrl: string | null;
  username: string | null;
  hasApiKey: boolean;
  hasPassword: boolean;
  isActive: boolean;
  updatedAt: string | null;
}

@Injectable()
export class ExportConnectionService {
  constructor(
    private readonly config: ConfigService,
    private readonly exportClient: ExportClientService,
    @InjectRepository(ExportConnection)
    private readonly connectionsRepo: Repository<ExportConnection>,
  ) {}

  private appSecret(): string {
    return (
      this.config.get<string>('INTEGRATIONS_SECRET_KEY') ||
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET')
    );
  }

  async getPublic(organizationId: string): Promise<ExportConnectionPublicDto> {
    const row = await this.connectionsRepo.findOne({
      where: { organizationId },
    });
    if (!row) {
      return {
        configured: false,
        mode: null,
        baseUrl: null,
        username: null,
        hasApiKey: false,
        hasPassword: false,
        isActive: false,
        updatedAt: null,
      };
    }
    return this.toPublic(row);
  }

  async upsert(
    organizationId: string,
    dto: UpsertExportConnectionDto,
  ): Promise<ExportConnectionPublicDto> {
    if (dto.mode === 'live') {
      const baseUrl = dto.baseUrl?.trim();
      if (!baseUrl) {
        throw new BadRequestException(
          'Base URL is required when export mode is live',
        );
      }
    }

    let row = await this.connectionsRepo.findOne({
      where: { organizationId },
    });

    if (!row) {
      row = this.connectionsRepo.create({
        organizationId,
        mode: dto.mode,
        baseUrl: null,
        apiKey: null,
        username: null,
        password: null,
        isActive: dto.isActive ?? true,
      });
    }

    row.mode = dto.mode;
    row.isActive = dto.isActive ?? true;
    row.baseUrl =
      dto.mode === 'live' ? (dto.baseUrl?.trim() || null) : null;

    if (dto.username !== undefined) {
      row.username = dto.username.trim() || null;
    }

    if (dto.clearApiKey) {
      row.apiKey = null;
    } else if (dto.apiKey != null && dto.apiKey.trim() !== '') {
      row.apiKey = encryptSecret(dto.apiKey.trim(), this.appSecret());
    }

    if (dto.clearPassword) {
      row.password = null;
    } else if (dto.password != null && dto.password.trim() !== '') {
      row.password = encryptSecret(dto.password.trim(), this.appSecret());
    }

    if (dto.mode === 'live') {
      const hasApiKey = Boolean(row.apiKey);
      const hasBasic = Boolean(row.username && row.password);
      if (!hasApiKey && !hasBasic) {
        throw new BadRequestException(
          'Live export requires an API key or username + password for this organization',
        );
      }
    }

    await this.connectionsRepo.save(row);
    return this.toPublic(row);
  }

  async disable(organizationId: string): Promise<ExportConnectionPublicDto> {
    const row = await this.connectionsRepo.findOne({
      where: { organizationId },
    });
    if (!row) {
      throw new NotFoundException('Export destination not found');
    }
    row.isActive = false;
    await this.connectionsRepo.save(row);
    return this.toPublic(row);
  }

  /** Verifies org credentials without exporting a document. */
  async test(organizationId: string) {
    const connection = await this.exportClient.resolveConnection(organizationId);
    await this.exportClient.authenticate(connection);
    return {
      ok: true,
      mode: connection.mode,
      message:
        connection.mode === 'mock'
          ? 'Sandbox export connection is active for this organization'
          : 'Export destination credentials accepted for this organization',
    };
  }

  private toPublic(row: ExportConnection): ExportConnectionPublicDto {
    return {
      configured: true,
      mode: row.mode,
      baseUrl: row.baseUrl,
      username: row.username,
      hasApiKey: Boolean(row.apiKey),
      hasPassword: Boolean(row.password),
      isActive: row.isActive,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }
}
