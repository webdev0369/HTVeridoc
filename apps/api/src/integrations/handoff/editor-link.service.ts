import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionCode, RoleCode } from '../../common/enums';
import { Document } from '../../documents/entities/document.entity';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60; 

export interface EditorLinkResult {
  token: string;
  url: string;
  documentId: string;
  expiresAt: string;
}

@Injectable()
export class EditorLinkService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
  ) {}

  private webOrigin(): string {
    return (
      this.config.get<string>('PUBLIC_WEB_URL') ||
      this.config.get<string>('CORS_ORIGIN') ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  /**
   * Create a time-limited JWT that other systems can use to open the review UI.
   * Token acts as a Bearer access token with document-scoped permissions.
   */
  async createLink(
    organizationId: string,
    documentId: string,
    expiresInSeconds?: number,
  ): Promise<EditorLinkResult> {
    const document = await this.documentsRepo.findOne({
      where: { id: documentId, organizationId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const ttl = Math.min(
      Math.max(expiresInSeconds ?? DEFAULT_TTL_SECONDS, 60),
      MAX_TTL_SECONDS,
    ); //
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const token = await this.jwt.signAsync(
      {
        sub: `editor:${documentId}`,
        email: 'editor-link@handoff.local',
        name: 'Editor link',
        organizationId,
        role: RoleCode.REVIEWER,
        permissions: [
          PermissionCode.DOCUMENT_READ,
          PermissionCode.DOCUMENT_EDIT,
          PermissionCode.DOCUMENT_APPROVE,
          PermissionCode.FIELD_READ,
        ],
        typ: 'editor_link',
        documentId,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: ttl,
      },
    );

    const url = `${this.webOrigin()}/editor/${encodeURIComponent(token)}`;
    return {
      token,
      url,
      documentId,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Best-effort editor URL for webhook payloads (creates a short-lived link).
   * Failures return null so webhooks still deliver.
   */
  async buildPublicEditorUrl(
    organizationId: string,
    documentId: string,
  ): Promise<string | null> {
    try {
      const link = await this.createLink(organizationId, documentId, 7 * 24 * 60 * 60);
      return link.url;
    } catch {
      return `${this.webOrigin()}/documents/${documentId}`;
    }
  }
}
