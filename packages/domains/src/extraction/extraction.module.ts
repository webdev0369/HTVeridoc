import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { Document } from '@htveridoc/db/documents/entities/document.entity';
import { FieldConfigCoreModule } from '../fields/field-config.module';
import { OrganizationsCoreModule } from '../organizations/organizations.module';
import { ProcessingLogModule } from '../processing-log/processing-log.module';
import { ValidationCoreModule } from '../validation/validation.module';
import { Extraction } from '@htveridoc/db/extraction/entities/extraction.entity';
import { ExtractionField } from '@htveridoc/db/extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '@htveridoc/db/extraction/entities/extraction-line-item.entity';
import { ExtractionSource } from '@htveridoc/db/extraction/entities/extraction-source.entity';
import { ExtractionController } from './extraction.controller';
import { ExtractionNormalizerService } from './extraction-normalizer.service';
import { ExtractionService } from './extraction.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Extraction,
      ExtractionField,
      ExtractionLineItem,
      ExtractionSource,
      Document,
    ]),
    AiModule,
    ProcessingLogModule,
    FieldConfigCoreModule,
    OrganizationsCoreModule,
    forwardRef(() => ValidationCoreModule),
  ],
  providers: [ExtractionService, ExtractionNormalizerService],
  exports: [ExtractionService],
})
export class ExtractionCoreModule {}

@Module({
  imports: [ExtractionCoreModule],
  controllers: [ExtractionController],
  exports: [ExtractionCoreModule],
})
export class ExtractionModule {}
