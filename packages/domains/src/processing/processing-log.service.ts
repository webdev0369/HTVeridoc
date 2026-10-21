import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentProcessingEvent } from '@htveridoc/db/processing/entities/document-processing-event.entity';

@Injectable()
export class ProcessingLogService {
  private readonly logger = new Logger('ExtractionLog');

  constructor(
    @InjectRepository(DocumentProcessingEvent)
    private readonly eventsRepo: Repository<DocumentProcessingEvent>,
  ) {}

  async log(
    documentId: string,
    organizationId: string,
    step: string,
    message: string,
    options?: {
      level?: 'info' | 'warn' | 'error' | 'success';
      meta?: Record<string, unknown>;
    },
  ) {
    const level = options?.level ?? 'info';
    const meta = options?.meta ?? null;

    const line = `[${documentId.slice(0, 8)}] ${step}: ${message}`;
    if (level === 'error') {
      this.logger.error(line);
    } else if (level === 'warn') {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }

    const event = await this.eventsRepo.save(
      this.eventsRepo.create({
        documentId,
        organizationId,
        step,
        level,
        message,
        meta,
      }),
    );

    return event;
  }

  async clearForDocument(documentId: string) {
    await this.eventsRepo.delete({ documentId });
  }

  async listForDocument(organizationId: string, documentId: string) {
    return this.eventsRepo.find({
      where: { documentId, organizationId },
      order: { createdAt: 'ASC' },
      take: 200,
    });
  }
}
