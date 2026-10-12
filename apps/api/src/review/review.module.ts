import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../documents/entities/document.entity';
import { DocumentsModule } from '../documents/documents.module';
import { Extraction } from '../extraction/entities/extraction.entity';
import { ExtractionField } from '../extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '../extraction/entities/extraction-line-item.entity';
import { ExtractionModule } from '../extraction/extraction.module';
import { FieldConfigModule } from '../fields/field-config.module';
import { ProcessingLogModule } from '../processing-log/processing-log.module';
import { ValidationModule } from '../validation/validation.module';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      Extraction,
      ExtractionField,
      ExtractionLineItem,
    ]),
    DocumentsModule,
    ExtractionModule,
    ProcessingLogModule,
    FieldConfigModule,
    ValidationModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
