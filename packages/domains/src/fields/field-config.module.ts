import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationDocumentFieldConfig } from '@htveridoc/db/fields/entities/organization-document-field-config.entity';
import { OrganizationFieldCorrection } from '@htveridoc/db/fields/entities/organization-field-correction.entity';
import { FieldConfigController } from './field-config.controller';
import { FieldConfigService } from './field-config.service';
import { FieldCorrectionService } from './field-correction.service';

/** Services only — safe to import from identity (register seed) without HTTP routes. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationDocumentFieldConfig,
      OrganizationFieldCorrection,
    ]),
  ],
  providers: [FieldConfigService, FieldCorrectionService],
  exports: [FieldConfigService, FieldCorrectionService],
})
export class FieldConfigCoreModule {}

/** documents microservice HTTP surface */
@Module({
  imports: [FieldConfigCoreModule],
  controllers: [FieldConfigController],
  exports: [FieldConfigCoreModule],
})
export class FieldConfigModule {}
