import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { ExportMatchingService } from './matching.service';
import { ExportPurchaseOrderService } from './purchase-order.service';
import { ExportClientService } from './export-client.service';
import {
  DOCUMENT_EXPORT_QUEUE,
  DocumentExportJobData,
} from './document-export.queue';

@Injectable()
export class DocumentExportService {
  private readonly logger = new Logger(DocumentExportService.name);

  constructor(
    @Inject(QUEUE_ENABLED) private readonly queueEnabled: boolean,
    private readonly moduleRef: ModuleRef,
    private readonly documentsService: DocumentsService,
    private readonly processingLog: ProcessingLogService,
    private readonly exportClient: ExportClientService,
    private readonly matching: ExportMatchingService,
    private readonly purchaseOrders: ExportPurchaseOrderService,
    @InjectRepository(ExportPoMapping)
    private readonly poMappingsRepo: Repository<ExportPoMapping>,
  ) {}

  /**
   * Called after approve. Moves document to EXPORTING, then runs export
   * via BullMQ or inline (same pattern as AI extraction).
   */
  async enqueueAfterApprove(organizationId: string, documentId: string) {
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
        throw new Error(
          `Matching incomplete: supplier=${match.supplier.matched ? 'ok' : 'missing'}, unmatchedProducts=${match.unmatchedProductCount}`,
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
