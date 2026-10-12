import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { DocumentStatus, DocumentType } from '../common/enums';
import { StorageService } from '../storage/storage.service';
import { Document } from './entities/document.entity';
import { assertPdfBuffer, getPdfPageCount } from './pdf.util';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async upload(
    organizationId: string,
    userId: string,
    file: Express.Multer.File,
    documentType: DocumentType = DocumentType.PURCHASE_ORDER_CONFIRMATION,
  ) {
    if (!file) {
      throw new NotFoundException('No file uploaded');
    }

    const allowedTypes = new Set(Object.values(DocumentType));
    allowedTypes.delete(DocumentType.UNKNOWN);
    if (!allowedTypes.has(documentType)) {
      throw new BadRequestException(`Unsupported document type: ${documentType}`);
    }

    const maxBytes = this.config.get<number>('MAX_UPLOAD_BYTES', 26_214_400);
    assertPdfBuffer(file.buffer, maxBytes);

    if (
      file.mimetype &&
      file.mimetype !== 'application/pdf' &&
      file.mimetype !== 'application/x-pdf'
    ) {
      throw new BadRequestException('Only PDF uploads are allowed');
    }

    const documentId = randomUUID();
    const sha256 = this.storage.sha256(file.buffer);
    const pageCount = await getPdfPageCount(file.buffer);
    const { relativePath } = await this.storage.saveOriginalPdf(
      organizationId,
      documentId,
      file.buffer,
    );

    const document = this.documentsRepo.create({
      id: documentId,
      organizationId,
      fileName: file.originalname || 'document.pdf',
      filePath: relativePath,
      mimeType: 'application/pdf',
      fileSize: String(file.buffer.length),
      sha256,
      pageCount,
      documentType,
      status: DocumentStatus.UPLOADED,
      uploadedBy: userId,
    });

    await this.documentsRepo.save(document);
    return this.toDto(document);
  }

  async list(organizationId: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const [items, total] = await this.documentsRepo.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      skip,
      take,
    });

    return {
      items: items.map((d) => this.toDto(d)),
      total,
      page: Math.max(page, 1),
      limit: take,
    };
  }

  async findOne(organizationId: string, id: string) {
    const document = await this.getOwned(organizationId, id);
    return this.toDto(document);
  }

  async getFileStream(organizationId: string, id: string) {
    const document = await this.getOwned(organizationId, id);
    const stream = this.storage.openReadStream(document.filePath);
    return {
      stream,
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSize: Number(document.fileSize),
    };
  }

  async softDelete(organizationId: string, id: string) {
    const document = await this.getOwned(organizationId, id);
    await this.documentsRepo.softRemove(document);
    return { success: true };
  }

  async setStatus(
    organizationId: string,
    id: string,
    status: DocumentStatus,
  ) {
    const document = await this.getOwned(organizationId, id);
    document.status = status;
    await this.documentsRepo.save(document);
    return this.toDto(document);
  }

  private async getOwned(organizationId: string, id: string) {
    const document = await this.documentsRepo.findOne({ where: { id } });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.organizationId !== organizationId) {
      throw new ForbiddenException('Document belongs to another organization');
    }
    return document;
  }

  private toDto(document: Document) {
    return {
      id: document.id,
      organizationId: document.organizationId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSize: Number(document.fileSize),
      sha256: document.sha256,
      pageCount: document.pageCount,
      documentType: document.documentType,
      status: document.status,
      uploadedBy: document.uploadedBy,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}
