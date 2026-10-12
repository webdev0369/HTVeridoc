import { Inject, Injectable, Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { QUEUE_ENABLED } from '../queue/redis-compat';
import { ExtractionService } from '../extraction/extraction.service';
import { DocumentsService } from '../documents/documents.service';
import { DocumentStatus } from '../common/enums';
import {
  AI_EXTRACTION_QUEUE,
  AiExtractionJobData,
} from './ai-extraction.processor';
import { ProcessingLogService } from './processing-log.service';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    @Inject(QUEUE_ENABLED) private readonly queueEnabled: boolean,
    private readonly moduleRef: ModuleRef,
    private readonly extractionService: ExtractionService,
    private readonly documentsService: DocumentsService,
    private readonly processingLog: ProcessingLogService,
  ) {}

  async enqueueExtraction(organizationId: string, documentId: string) {
    await this.processingLog.clearForDocument(documentId);
    await this.processingLog.log(
      documentId,
      organizationId,
      'ENQUEUE',
      this.queueEnabled
        ? 'Queue enabled — attempting BullMQ job'
        : 'Queue disabled — will run inline',
      { meta: { queueEnabled: this.queueEnabled } },
    );

    await this.documentsService.setStatus(
      organizationId,
      documentId,
      DocumentStatus.PROCESSING,
    );

    const queue = this.resolveQueue();
    if (this.queueEnabled && queue) {
      try {
        const job = await queue.add(
          'extract',
          { documentId, organizationId },
          {
            jobId: `extract-${documentId}-${Date.now()}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );

        await this.processingLog.log(
          documentId,
          organizationId,
          'QUEUED',
          `Job queued (${job.id})`,
          { meta: { jobId: job.id } },
        );

        this.logger.log(
          `Enqueued extraction job ${job.id} for document ${documentId}`,
        );

        return {
          documentId,
          status: DocumentStatus.PROCESSING,
          jobId: job.id,
          mode: 'queue' as const,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Queue unavailable';
        this.logger.warn(
          `Queue enqueue failed (${message}); falling back to inline`,
        );
      }
    }

    this.logger.log(
      `Running extraction inline for document ${documentId} (BullMQ unavailable)`,
    );
    void this.processingLog.log(
      documentId,
      organizationId,
      'INLINE',
      'Running extraction inline in background',
    );

    void this.extractionService
      .processDocument(documentId, organizationId)
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Extraction failed';
        this.logger.error(
          `Inline extraction failed for ${documentId}: ${message}`,
        );
      });

    return {
      documentId,
      status: DocumentStatus.PROCESSING,
      jobId: null,
      mode: 'inline' as const,
    };
  }

  private resolveQueue(): Queue<AiExtractionJobData> | null {
    if (!this.queueEnabled) {
      return null;
    }
    try {
      return this.moduleRef.get<Queue<AiExtractionJobData>>(
        getQueueToken(AI_EXTRACTION_QUEUE),
        { strict: false },
      );
    } catch {
      return null;
    }
  }
}
