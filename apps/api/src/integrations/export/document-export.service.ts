import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { DocumentStatus } from '../../common/enums';
import { DocumentsService } from '../../documents/documents.service';
import { ProcessingLogService } from '../../processing/processing-log.service';
import { QUEUE_ENABLED } from '../../queue/redis-compat';
import { ExportPoMapping } from './entities/export-po-mapping.entity';
import { ExportConnectionService } from './export-connection.service';
import { ExportMatchingService } from './matching.service';
import { ExportPurchaseOrderService } from './purchase-order.service';
import { ExportClientService } from './export-client.service';
import type { DocumentMatchResult } from './export.types';
import {
  DOCUMENT_EXPORT_QUEUE,
  DocumentExportJobData,
} from './document-export.queue';

export interface DocumentExportStatusDto {
  documentId: string;
  documentStatus: DocumentStatus;
  configured: boolean;
  connectionMode: 'mock' | 'live' | null;
  connectionActive: boolean;
  exportStatus: 'pending' | 'exporting' | 'exported' | 'failed' | null;
  destinationPoId: string | null;
  externalPoNumber: string | null;
  lastError: string | null;
  exportedAt: string | null;
  matchSummary: Record<string, unknown> | null;
}

export interface DocumentExportMatchPreviewDto {
  configured: boolean;
  connectionMode: 'mock' | 'live' | null;
  connectionActive: boolean;
  message: string | null;
  match: DocumentMatchResult | null;
}

@Injectable()
export class DocumentExportService {
  private readonly logger = new Logger(DocumentExportService.name);

  constructor(
    @Inject(QUEUE_ENABLED) private readonly queueEnabled: boolean,
    private readonly moduleRef: ModuleRef,
    private readonly documentsService: DocumentsService,
    private readonly processingLog: ProcessingLogService,
    private readonly exportClient: ExportClientService,
    private readonly connections: ExportConnectionService,
    private readonly matching: ExportMatchingService,
    private readonly purchaseOrders: ExportPurchaseOrderService,
    @InjectRepository(ExportPoMapping)
    private readonly poMappingsRepo: Repository<ExportPoMapping>,
  ) {}

  async getStatus(
    organizationId: string,
    documentId: string,
  ): Promise<DocumentExportStatusDto> {
    const document = await this.documentsService.findOne(
      organizationId,
      documentId,
    );
    const connection = await this.connections.getPublic(organizationId);

    const mapping = await this.poMappingsRepo.findOne({
      where: { organizationId, documentId },
    });

    return {
      documentId,
      documentStatus: document.status,
      configured: connection.configured,
      connectionMode: connection.mode,
      connectionActive: connection.configured && connection.isActive,
      exportStatus: mapping?.exportStatus ?? null,
      destinationPoId: mapping?.destinationPoId ?? null,
      externalPoNumber: mapping?.externalPoNumber ?? null,
      lastError: mapping?.lastError ?? null,
      exportedAt: mapping?.exportedAt?.toISOString() ?? null,
      matchSummary: mapping?.matchSummary ?? null,
    };
  }

  /**
   * Dry-run matching for the review UI (does not export).
   * Sandbox orgs get deterministic matches; Live uses mappings + lookups.
   */
  async previewMatch(
    organizationId: string,
    documentId: string,
  ): Promise<DocumentExportMatchPreviewDto> {
    await this.documentsService.findOne(organizationId, documentId);

    try {
      const connection =
        await this.exportClient.resolveConnection(organizationId);
      const match = await this.matching.matchDocument(connection, documentId);
      return {
        configured: true,
        connectionMode: connection.mode,
        connectionActive: true,
        message:
          connection.mode === 'mock'
            ? 'Sandbox matching — safe test IDs for this organization'
            : match.readyForExport
              ? 'Ready to export after approve'
              : 'Some supplier or product lines still need matching',
        match,
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Export destination is not ready for matching';
      const looksDisabled = /disabled/i.test(message);
      return {
        // Settings row may exist but be inactive — surface that clearly in UI.
        configured: looksDisabled,
        connectionMode: null,
        connectionActive: false,
        message,
        match: null,
      };
    }
  }

  /** Retry export after EXPORT_FAILED without reopening the whole review. */
  async retryExport(organizationId: string, documentId: string) {
    const document = await this.documentsService.findOne(
      organizationId,
      documentId,
    );
    if (
      document.status !== DocumentStatus.EXPORT_FAILED &&
      document.status !== DocumentStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Cannot retry export from status ${document.status}`,
      );
    }
    return this.enqueueAfterApprove(organizationId, documentId);
  }

  /**
   * Called after approve. Only runs when Export destination is configured+active.
   * SaaS handoff (webhooks) does not require this — other systems create orders.
   */
  async enqueueAfterApprove(organizationId: string, documentId: string) {
    const connection = await this.connections.getPublic(organizationId);
    if (!connection.configured || !connection.isActive) {
      this.logger.debug(
        `Skipping destination export for ${documentId} — export connection not active (handoff/webhooks only)`,
      );
      await this.processingLog.log(
        documentId,
        organizationId,
        'EXPORT_SKIPPED',
        'Export destination not configured — document stays APPROVED; notify via webhook handoff',
        { level: 'info' },
      );
      return { mode: 'skipped' as const, jobId: null };
    }

    await this.documentsService.setStatus(
      organizationId,
      documentId,
      DocumentStatus.EXPORTING,
    );
    await this.processingLog.log(
      documentId,
      organizationId,
      'EXPORT_STARTED',
      'Export started after approve',
      { level: 'info' },
    );

    const queue = this.resolveQueue();
    if (this.queueEnabled && queue) {
      try {
        const job = await queue.add(
          'export',
          { documentId, organizationId },
          {
            jobId: `export-${documentId}-${Date.now()}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );
        await this.processingLog.log(
          documentId,
          organizationId,
          'EXPORT_QUEUED',
          `Export queued (${job.id})`,
          { meta: { jobId: job.id } },
        );
        return { mode: 'queue' as const, jobId: job.id };
      } catch (err) {
        this.logger.warn(
          `Export queue failed (${err instanceof Error ? err.message : 'error'}); running inline`,
        );
      }
    }

    void this.exportDocument(organizationId, documentId).catch((err) => {
      this.logger.error(
        `Inline export failed for ${documentId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    });

    return { mode: 'inline' as const, jobId: null };
  }

  /**
   * Full export pipeline with idempotency via export_po_mappings.document_id.
   */
  async exportDocument(organizationId: string, documentId: string) {
    let mapping = await this.poMappingsRepo.findOne({
      where: { organizationId, documentId },
    });

    // Idempotent success path — never create a second destination PO.
    if (
      mapping?.exportStatus === 'exported' &&
      mapping.destinationPoId
    ) {
      await this.documentsService.setStatus(
        organizationId,
        documentId,
        DocumentStatus.EXPORTED,
      );
      await this.processingLog.log(
        documentId,
        organizationId,
        'EXPORT_IDEMPOTENT',
        `Document already exported (destination PO ${mapping.destinationPoId})`,
        {
          level: 'success',
          meta: { destinationPoId: mapping.destinationPoId },
        },
      );
      return {
        status: DocumentStatus.EXPORTED,
        destinationPoId: mapping.destinationPoId,
        idempotent: true,
      };
    }

    if (!mapping) {
      mapping = this.poMappingsRepo.create({
        organizationId,
        documentId,
        exportStatus: 'exporting',
      });
    } else {
      mapping.exportStatus = 'exporting';
      mapping.lastError = null;
    }
    await this.poMappingsRepo.save(mapping);

    try {
      const connection = await this.exportClient.resolveConnection(organizationId);
      await this.exportClient.authenticate(connection);

      const match = await this.matching.matchDocument(connection, documentId);
      mapping.externalPoNumber = match.documentNumber;
      mapping.matchSummary = {
        supplier: match.supplier,
        products: match.products,
        unmatchedProductCount: match.unmatchedProductCount,
        readyForExport: match.readyForExport,
        connectionMode: connection.mode,
        connectionSource: connection.source,
      };

      if (!match.readyForExport) {
        const supplierPart = match.supplier.matched
          ? 'supplier matched'
          : 'supplier not matched';
        const productPart =
          match.unmatchedProductCount > 0
            ? `${match.unmatchedProductCount} product line(s) not matched`
            : 'products matched';
        throw new Error(
          `Export matching incomplete — ${supplierPart}; ${productPart}. Review the match panel, then retry export.`,
        );
      }

      const result = await this.purchaseOrders.createOrUpdate(connection, {
        documentId,
        existingPoId: mapping.destinationPoId,
        match,
      });

      mapping.destinationPoId = result.destinationPoId;
      mapping.exportPayload = result.payload;
      mapping.exportStatus = 'exported';
      mapping.exportedAt = new Date();
      mapping.lastError = null;
      await this.poMappingsRepo.save(mapping);

      await this.documentsService.setStatus(
        organizationId,
        documentId,
        DocumentStatus.EXPORTED,
      );
      await this.processingLog.log(
        documentId,
        organizationId,
        'EXPORTED',
        result.created
          ? `Exported to destination PO ${result.destinationPoId}`
          : `Updated destination PO ${result.destinationPoId}`,
        {
          level: 'success',
          meta: {
            destinationPoId: result.destinationPoId,
            created: result.created,
            mode: connection.mode,
          },
        },
      );

      return {
        status: DocumentStatus.EXPORTED,
        destinationPoId: result.destinationPoId,
        idempotent: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      mapping.exportStatus = 'failed';
      mapping.lastError = message;
      await this.poMappingsRepo.save(mapping);

      await this.documentsService.setStatus(
        organizationId,
        documentId,
        DocumentStatus.EXPORT_FAILED,
      );
      await this.processingLog.log(
        documentId,
        organizationId,
        'EXPORT_FAILED',
        message,
        { level: 'error', meta: { error: message } },
      );

      throw err;
    }
  }

  private resolveQueue(): Queue<DocumentExportJobData> | null {
    if (!this.queueEnabled) return null;
    try {
      return this.moduleRef.get<Queue<DocumentExportJobData>>(
        getQueueToken(DOCUMENT_EXPORT_QUEUE),
        { strict: false },
      );
    } catch {
      return null;
    }
  }
}
