import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { AiRequest } from './ai/entities/ai-request.entity';
import { DocumentsModule } from './documents/documents.module';
import { Extraction } from './extraction/entities/extraction.entity';
import { ExtractionField } from './extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from './extraction/entities/extraction-line-item.entity';
import { ExtractionSource } from './extraction/entities/extraction-source.entity';
import { ExtractionModule } from './extraction/extraction.module';
import { DocumentProcessingEvent } from './processing/entities/document-processing-event.entity';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProcessingModule } from './processing/processing.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { Organization } from './organizations/entities/organization.entity';
import { User } from './users/entities/user.entity';
import { Role } from './users/entities/role.entity';
import { Permission } from './users/entities/permission.entity';
import { OrganizationUser } from './users/entities/organization-user.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';
import { Document } from './documents/entities/document.entity';
import { ValidationResult } from './validation/entities/validation-result.entity';
import { DocumentValidationError } from './validation/entities/document-validation-error.entity';
import { ValidationModule } from './validation/validation.module';
import { ReviewModule } from './review/review.module';
import { FieldConfigModule } from './fields/field-config.module';
import { OrganizationDocumentFieldConfig } from './fields/entities/organization-document-field-config.entity';
import { OrganizationFieldCorrection } from './fields/entities/organization-field-correction.entity';
import { ExportModule } from './integrations/export/export.module';
import { ExportConnection } from './integrations/export/entities/export-connection.entity';
import { ExportSupplierMapping } from './integrations/export/entities/export-supplier-mapping.entity';
import { ExportProductMapping } from './integrations/export/entities/export-product-mapping.entity';
import { ExportPoMapping } from './integrations/export/entities/export-po-mapping.entity';
import { HandoffModule } from './integrations/handoff/handoff.module';
import { WebhookEndpoint } from './integrations/handoff/entities/webhook-endpoint.entity';

@Module({
  imports: [
    AppConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [
          Organization,
          User,
          Role,
          Permission,
          OrganizationUser,
          RefreshToken,
          Document,
          Extraction,
          ExtractionField,
          ExtractionLineItem,
          ExtractionSource,
          DocumentProcessingEvent,
          AiRequest,
          ValidationResult,
          DocumentValidationError,
          OrganizationDocumentFieldConfig,
          OrganizationFieldCorrection,
          ExportConnection,
          ExportSupplierMapping,
          ExportProductMapping,
          ExportPoMapping,
          WebhookEndpoint,
        ],
        synchronize: false,
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    StorageModule,
    QueueModule.forRootAsync(),
    HealthModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    AiModule,
    ExtractionModule,
    ValidationModule,
    ExportModule.forRootAsync(),
    HandoffModule,
    ReviewModule,
    FieldConfigModule,
    ProcessingModule.forRootAsync(),
    DocumentsModule,
  ],
})
export class AppModule {}
