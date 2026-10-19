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
import {
  isEditorLinkUserId,
  resolveEditorDocumentId,
} from '../auth/editor-link.util';
import { DocumentQueuesService } from '../document-queues/document-queues.service';
import { DocumentStatus, DocumentType, PermissionCode } from '../common/enums';
import { HandoffDispatchService } from '../integrations/handoff/handoff-dispatch.service';
import { ProcessingLogService } from '../processing/processing-log.service';
import { StorageService } from '../storage/storage.service';
import { Document } from './entities/document.entity';
import { assertPdfBuffer, getPdfPageCount } from './pdf.util';

type DocumentActor = {
  userId: string;
  permissions: PermissionCode[];
  /** Present on handoff editor-link JWTs. */
  documentId?: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly handoff: HandoffDispatchService,
    private readonly documentQueues: DocumentQueuesService,
    private readonly processingLog: ProcessingLogService,
  ) {}

  async upload(
    organizationId: string,
    userId: string,
    file: Express.Multer.File,
    documentType: DocumentType = DocumentType.PURCHASE_ORDER_CONFIRMATION,
    queueId?: string | null,
    actorPermissions: PermissionCode[] = [],
  ) {
    if (!file) {
      throw new NotFoundException('No file uploaded');
    }

    const allowedTypes = new Set(Object.values(DocumentType));
    allowedTypes.delete(DocumentType.UNKNOWN);
    if (!allowedTypes.has(documentType)) {
      throw new BadRequestException(`Unsupported document type: ${documentType}`);
    }

    let resolvedType = documentType;
    let resolvedQueueId: string | null = null;

    if (queueId) {
      const queue = await this.documentQueues.requireActiveQueueForUpload(
        organizationId,
        queueId,
        { userId, permissions: actorPermissions },
      );
      resolvedQueueId = queue.id;
      resolvedType = queue.documentType;
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
      documentType: resolvedType,
      queueId: resolvedQueueId,
      status: DocumentStatus.UPLOADED,
      uploadedBy: userId,
    });

    await this.documentsRepo.save(document);
    return this.toDto(document);
  }

  async list(
    organizationId: string,
    page = 1,
    limit = 20,
    options?: {
      queueId?: string | null;
      actor?: DocumentActor;
    },
  ) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const qb = this.documentsRepo
      .createQueryBuilder('d')
      .where('d.organization_id = :organizationId', { organizationId })
      .andWhere('d.deleted_at IS NULL')
      .orderBy('d.created_at', 'DESC')
      .skip(skip)
      .take(take);

    if (options?.actor && isEditorLinkUserId(options.actor.userId)) {
      const editorDocId = resolveEditorDocumentId(
        options.actor.userId,
        options.actor.documentId,
      );
      if (!editorDocId) {
        return { items: [], total: 0, page: Math.max(page, 1), limit: take };
      }
      qb.andWhere('d.id = :editorDocId', { editorDocId });
    } else if (options?.queueId) {
      await this.documentQueues.assertCanAccessQueue(
        organizationId,
        options.queueId,
        options.actor ?? { userId: '', permissions: [] },
      );
      qb.andWhere('d.queue_id = :queueId', { queueId: options.queueId });
    } else if (options?.actor) {
      const canManage = options.actor.permissions.includes(
        PermissionCode.QUEUE_MANAGE,
      );
      if (!canManage) {
        // Restrict to: unassigned docs + open queues + member queues
        qb.andWhere(
          `(
            d.queue_id IS NULL
            OR d.queue_id IN (
              SELECT q.id FROM document_queues q
              WHERE q.organization_id = :organizationId
                AND q.is_active = true
                AND (
                  NOT EXISTS (
                    SELECT 1 FROM document_queue_members m WHERE m.queue_id = q.id
                  )
                  OR EXISTS (
                    SELECT 1 FROM document_queue_members m
                    WHERE m.queue_id = q.id AND m.user_id = :actorUserId
                  )
                )
            )
          )`,
          { organizationId, actorUserId: options.actor.userId },
        );
      }
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((d) => this.toDto(d)),
      total,
      page: Math.max(page, 1),
      limit: take,
    };
  }

  async findOne(
    organizationId: string,
    id: string,
    actor?: DocumentActor,
  ) {
    this.assertEditorDocumentAccess(actor, id);
    let document = await this.getOwned(organizationId, id);
    if (actor && !isEditorLinkUserId(actor.userId)) {
      await this.documentQueues.assertCanAccessQueue(
        organizationId,
        document.queueId,
        actor,
      );
    }
    // Opening the document editor while ready → IN_REVIEW (Rossum-style).
    document = await this.enterReviewIfNeeded(document, actor);
    return this.toDto(document);
  }

  async getFileStream(
    organizationId: string,
    id: string,
    actor?: DocumentActor,
  ) {
    this.assertEditorDocumentAccess(actor, id);
    let document = await this.getOwned(organizationId, id);
    if (actor && !isEditorLinkUserId(actor.userId)) {
      await this.documentQueues.assertCanAccessQueue(
        organizationId,
        document.queueId,
        actor,
      );
    }
    document = await this.enterReviewIfNeeded(document, actor);
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

  async assignQueue(
    organizationId: string,
    id: string,
    queueId: string | null,
    actor: { userId: string; permissions: PermissionCode[] },
  ) {
    const document = await this.getOwned(organizationId, id);
    await this.documentQueues.assertCanAccessQueue(
      organizationId,
      document.queueId,
      actor,
    );

    if (queueId) {
      const queue = await this.documentQueues.requireActiveQueueForUpload(
        organizationId,
        queueId,
        actor,
      );
      document.queueId = queue.id;
      document.documentType = queue.documentType;
    } else {
      document.queueId = null;
    }

    await this.documentsRepo.save(document);
    return this.toDto(document);
  }

  async setStatus(
    organizationId: string,
    id: string,
    status: DocumentStatus,
  ) {
    const document = await this.getOwned(organizationId, id);
    document.status = status;
    await this.documentsRepo.save(document);
    this.handoff.notifyStatus(organizationId, id, status);
    return this.toDto(document);
  }

  private assertEditorDocumentAccess(
    actor: DocumentActor | undefined,
    documentId: string,
  ) {
    if (!actor || !isEditorLinkUserId(actor.userId)) return;
    const scoped = resolveEditorDocumentId(actor.userId, actor.documentId);
    if (!scoped || scoped !== documentId) {
      throw new ForbiddenException(
        'Editor link is scoped to a different document',
      );
    }
  }

  /**
   * When a reviewer opens a document that is waiting for review, move it to
   * IN_REVIEW so lists/webhooks show active review (does not run on list).
   */
  private async enterReviewIfNeeded(
    document: Document,
    actor?: DocumentActor,
  ): Promise<Document> {
    if (!actor?.permissions?.includes(PermissionCode.DOCUMENT_EDIT)) {
      return document;
    }
    if (
      document.status !== DocumentStatus.READY_FOR_REVIEW &&
      document.status !== DocumentStatus.VALIDATION_FAILED
    ) {
      return document;
    }

    document.status = DocumentStatus.IN_REVIEW;
    await this.documentsRepo.save(document);
    await this.processingLog.log(
      document.id,
      document.organizationId,
      'REVIEW_STARTED',
      'Document opened for review',
      { level: 'info' },
    );
    this.handoff.notifyStatus(
      document.organizationId,
      document.id,
      DocumentStatus.IN_REVIEW,
    );
    return document;
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
      queueId: document.queueId,
      status: document.status,
      uploadedBy: document.uploadedBy,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}
