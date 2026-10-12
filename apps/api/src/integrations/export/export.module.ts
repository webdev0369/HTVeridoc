import { DynamicModule, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsModule } from '../../documents/documents.module';
import { Extraction } from '../../extraction/entities/extraction.entity';
import { ExtractionField } from '../../extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '../../extraction/entities/extraction-line-item.entity';
import { ProcessingLogModule } from '../../processing-log/processing-log.module';
import { checkRedisBullMqCompat } from '../../queue/redis-compat';
import { ExportConnection } from './entities/export-connection.entity';
import { ExportPoMapping } from './entities/export-po-mapping.entity';
import { ExportProductMapping } from './entities/export-product-mapping.entity';
import { ExportSupplierMapping } from './entities/export-supplier-mapping.entity';
import { ExportConnectionService } from './export-connection.service';
import { DocumentExportService } from './document-export.service';
import { ExportMatchingService } from './matching.service';
import { ExportProductService } from './product.service';
import { ExportPurchaseOrderService } from './purchase-order.service';
import { ExportSupplierService } from './supplier.service';
import { ExportConnectionController } from './export-connection.controller';
import { DocumentExportProcessor } from './document-export.processor';
import { DOCUMENT_EXPORT_QUEUE } from './document-export.queue';
import { ExportClientService } from './export-client.service';

@Module({})
export class ExportModule {
  static async forRootAsync(): Promise<DynamicModule> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const compat = await checkRedisBullMqCompat(redisUrl);

    return {
      module: ExportModule,
      global: true,
      imports: [
        TypeOrmModule.forFeature([
          ExportConnection,
          ExportSupplierMapping,
          ExportProductMapping,
          ExportPoMapping,
          Extraction,
          ExtractionField,
          ExtractionLineItem,
        ]),
        DocumentsModule,
        ProcessingLogModule,
        ...(compat.ok
          ? [BullModule.registerQueue({ name: DOCUMENT_EXPORT_QUEUE })]
          : []),
      ],
      controllers: [ExportConnectionController],
      providers: [
        ExportClientService,
        ExportConnectionService,
        ExportSupplierService,
        ExportProductService,
        ExportPurchaseOrderService,
        ExportMatchingService,
        DocumentExportService,
        ...(compat.ok ? [DocumentExportProcessor] : []),
      ],
      exports: [
        ExportClientService,
        ExportConnectionService,
        ExportMatchingService,
        DocumentExportService,
      ],
    };
  }
}
