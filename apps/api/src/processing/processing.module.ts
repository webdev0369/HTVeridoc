import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsModule } from '../documents/documents.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { ProcessingLogModule } from '../processing-log/processing-log.module';
import { checkRedisBullMqCompat } from '../queue/redis-compat';
import {
  AI_EXTRACTION_QUEUE,
  AiExtractionProcessor,
} from './ai-extraction.processor';
import { ProcessingController } from './processing.controller';
import { ProcessingService } from './processing.service';

@Module({})
export class ProcessingModule {
  static async forRootAsync(): Promise<DynamicModule> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const compat = await checkRedisBullMqCompat(redisUrl);

    return {
      module: ProcessingModule,
      imports: [
        DocumentsModule,
        ExtractionModule,
        ProcessingLogModule,
        ...(compat.ok
          ? [BullModule.registerQueue({ name: AI_EXTRACTION_QUEUE })]
          : []),
      ],
      controllers: [ProcessingController],
      providers: [
        ProcessingService,
        ...(compat.ok ? [AiExtractionProcessor] : []),
      ],
      exports: [ProcessingService],
    };
  }
}
