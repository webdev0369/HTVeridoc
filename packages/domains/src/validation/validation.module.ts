import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '@htveridoc/db/documents/entities/document.entity';
import { Extraction } from '@htveridoc/db/extraction/entities/extraction.entity';
import { FieldConfigCoreModule } from '../fields/field-config.module';
import { ProcessingLogModule } from '../processing-log/processing-log.module';
import { DocumentValidationError } from '@htveridoc/db/validation/entities/document-validation-error.entity';
import { ValidationResult } from '@htveridoc/db/validation/entities/validation-result.entity';
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
    FieldConfigCoreModule,
  ],
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationCoreModule {}

@Module({
  imports: [ValidationCoreModule],
  controllers: [ValidationController],
  exports: [ValidationCoreModule],
})
export class ValidationModule {}
