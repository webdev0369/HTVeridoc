import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentProcessingEvent } from '@htveridoc/db/processing/entities/document-processing-event.entity';
import { ProcessingLogService } from '../processing/processing-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentProcessingEvent])],
  providers: [ProcessingLogService],
  exports: [ProcessingLogService],
})
export class ProcessingLogModule {}
