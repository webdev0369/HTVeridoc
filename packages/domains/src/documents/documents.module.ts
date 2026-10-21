import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthModule } from '@htveridoc/shared/auth/jwt-auth.module';
import { DocumentQueuesModule } from '../document-queues/document-queues.module';
import { ProcessingLogModule } from '../processing-log/processing-log.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { Document } from '@htveridoc/db/documents/entities/document.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document]),
    JwtAuthModule,
    DocumentQueuesModule,
    ProcessingLogModule,
  ],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsCoreModule {}

@Module({
  imports: [DocumentsCoreModule],
  controllers: [DocumentsController],
  exports: [DocumentsCoreModule],
})
export class DocumentsModule {}
