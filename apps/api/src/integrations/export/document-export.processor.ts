import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DocumentExportService } from './document-export.service';
import {
  DOCUMENT_EXPORT_QUEUE,
  DocumentExportJobData,
} from './document-export.queue';

@Processor(DOCUMENT_EXPORT_QUEUE)
export class DocumentExportProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentExportProcessor.name);

  constructor(private readonly exportService: DocumentExportService) {
    super();
  }

  async process(job: Job<DocumentExportJobData>) {
    this.logger.log(
      `Processing export job ${job.id} for document ${job.data.documentId}`,
    );
    return this.exportService.exportDocument(
      job.data.organizationId,
      job.data.documentId,
    );
  }
}
