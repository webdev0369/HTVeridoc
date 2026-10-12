import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../documents/entities/document.entity';
import { Extraction } from '../extraction/entities/extraction.entity';
import { FieldConfigModule } from '../fields/field-config.module';
import { ProcessingLogModule } from '../processing-log/processing-log.module';
import { DocumentValidationError } from './entities/document-validation-error.entity';
import { ValidationResult } from './entities/validation-result.entity';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ValidationResult,
      DocumentValidationError,
      Document,
      Extraction,
    ]),
    ProcessingLogModule,
    FieldConfigModule,
  ],
  controllers: [ValidationController],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}
