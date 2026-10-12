import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { Document } from '../documents/entities/document.entity';
import { FieldConfigModule } from '../fields/field-config.module';
import { ProcessingLogModule } from '../processing-log/processing-log.module';
import { ValidationModule } from '../validation/validation.module';
import { Extraction } from './entities/extraction.entity';
import { ExtractionField } from './entities/extraction-field.entity';
import { ExtractionLineItem } from './entities/extraction-line-item.entity';
import { ExtractionSource } from './entities/extraction-source.entity';
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
    FieldConfigModule,
    forwardRef(() => ValidationModule),
  ],
  controllers: [ExtractionController],
  providers: [ExtractionService, ExtractionNormalizerService],
  exports: [ExtractionService],
})
export class ExtractionModule {}
