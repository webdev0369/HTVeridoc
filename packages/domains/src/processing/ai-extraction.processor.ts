import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ExtractionService } from '../extraction/extraction.service';

export const AI_EXTRACTION_QUEUE = 'ai-extraction';

export interface AiExtractionJobData {
  documentId: string;
  organizationId: string;
}

@Processor(AI_EXTRACTION_QUEUE)
export class AiExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(AiExtractionProcessor.name);

  constructor(private readonly extractionService: ExtractionService) {
    super();
  }

  async process(job: Job<AiExtractionJobData>) {
    this.logger.log(
      `Processing AI extraction job ${job.id} for document ${job.data.documentId}`,
    );
    return this.extractionService.processDocument(
      job.data.documentId,
      job.data.organizationId,
    );
  }
}
