import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationDocumentFieldConfig } from './entities/organization-document-field-config.entity';
import { OrganizationFieldCorrection } from './entities/organization-field-correction.entity';
import { FieldConfigController } from './field-config.controller';
import { FieldConfigService } from './field-config.service';
import { FieldCorrectionService } from './field-correction.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationDocumentFieldConfig,
      OrganizationFieldCorrection,
    ]),
  ],
  controllers: [FieldConfigController],
  providers: [FieldConfigService, FieldCorrectionService],
  exports: [FieldConfigService, FieldCorrectionService],
})
export class FieldConfigModule {}
