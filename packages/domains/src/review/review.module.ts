import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '@htveridoc/db/documents/entities/document.entity';
import { DocumentsCoreModule } from '../documents/documents.module';
import { Extraction } from '@htveridoc/db/extraction/entities/extraction.entity';
import { ExtractionField } from '@htveridoc/db/extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '@htveridoc/db/extraction/entities/extraction-line-item.entity';
import { ExtractionCoreModule } from '../extraction/extraction.module';
import { FieldConfigCoreModule } from '../fields/field-config.module';
import { OrganizationsCoreModule } from '../organizations/organizations.module';
import { ProcessingLogModule } from '../processing-log/processing-log.module';
import { ValidationModule } from '../validation/validation.module';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { HandoffCoreModule } from '../integrations/handoff/handoff.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      Extraction,
      ExtractionField,
      ExtractionLineItem,
    ]),
    DocumentsCoreModule,
    ExtractionCoreModule,
    ProcessingLogModule,
    FieldConfigCoreModule,
    OrganizationsCoreModule,
    ValidationModule,
    HandoffCoreModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
