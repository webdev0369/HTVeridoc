import { AiRequest } from '@htveridoc/db/ai/entities/ai-request.entity';
import { RefreshToken } from '@htveridoc/db/auth/entities/refresh-token.entity';
import { DocumentQueue } from '@htveridoc/db/document-queues/entities/document-queue.entity';
import { DocumentQueueMember } from '@htveridoc/db/document-queues/entities/document-queue-member.entity';
import { Document } from '@htveridoc/db/documents/entities/document.entity';
import { Extraction } from '@htveridoc/db/extraction/entities/extraction.entity';
import { ExtractionField } from '@htveridoc/db/extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '@htveridoc/db/extraction/entities/extraction-line-item.entity';
import { ExtractionSource } from '@htveridoc/db/extraction/entities/extraction-source.entity';
import { OrganizationDocumentFieldConfig } from '@htveridoc/db/fields/entities/organization-document-field-config.entity';
import { OrganizationFieldCorrection } from '@htveridoc/db/fields/entities/organization-field-correction.entity';
import { ExportConnection } from '@htveridoc/db/integrations/export/entities/export-connection.entity';
import { ExportPoMapping } from '@htveridoc/db/integrations/export/entities/export-po-mapping.entity';
import { ExportProductMapping } from '@htveridoc/db/integrations/export/entities/export-product-mapping.entity';
import { ExportSupplierMapping } from '@htveridoc/db/integrations/export/entities/export-supplier-mapping.entity';
import { WebhookEndpoint } from '@htveridoc/db/integrations/handoff/entities/webhook-endpoint.entity';
import { Organization } from '@htveridoc/db/organizations/entities/organization.entity';
import { DocumentProcessingEvent } from '@htveridoc/db/processing/entities/document-processing-event.entity';
import { OrganizationUser } from '@htveridoc/db/users/entities/organization-user.entity';
import { Permission } from '@htveridoc/db/users/entities/permission.entity';
import { Role } from '@htveridoc/db/users/entities/role.entity';
import { User } from '@htveridoc/db/users/entities/user.entity';
import { DocumentValidationError } from '@htveridoc/db/validation/entities/document-validation-error.entity';
import { ValidationResult } from '@htveridoc/db/validation/entities/validation-result.entity';

/** Full shared-Postgres entity graph (all microservices use the same DB today). */
export const ALL_ENTITIES = [
  Organization,
  User,
  Role,
  Permission,
  OrganizationUser,
  RefreshToken,
  Document,
  DocumentQueue,
  DocumentQueueMember,
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
];
