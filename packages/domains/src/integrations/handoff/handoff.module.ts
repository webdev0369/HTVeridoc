import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthModule } from '@htveridoc/shared/auth/jwt-auth.module';
import { Document } from '@htveridoc/db/documents/entities/document.entity';
import { Extraction } from '@htveridoc/db/extraction/entities/extraction.entity';
import { ExtractionField } from '@htveridoc/db/extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '@htveridoc/db/extraction/entities/extraction-line-item.entity';
import { Organization } from '@htveridoc/db/organizations/entities/organization.entity';
import { CredentialsService } from './credentials.service';
import { EditorLinkService } from './editor-link.service';
import { HandoffController } from './handoff.controller';
import { HandoffDispatchService } from './handoff-dispatch.service';
import { WebhookEndpoint } from '@htveridoc/db/integrations/handoff/entities/webhook-endpoint.entity';
import { WebhookEndpointService } from './webhook-endpoint.service';

/** Dispatch/credentials without HTTP — other services import this. */
@Global()
@Module({
  imports: [
    JwtAuthModule,
    TypeOrmModule.forFeature([
      WebhookEndpoint,
      Organization,
      Document,
      Extraction,
      ExtractionField,
      ExtractionLineItem,
    ]),
  ],
  providers: [
    WebhookEndpointService,
    EditorLinkService,
    HandoffDispatchService,
    CredentialsService,
  ],
  exports: [
    WebhookEndpointService,
    EditorLinkService,
    HandoffDispatchService,
    CredentialsService,
  ],
})
export class HandoffCoreModule {}

/** integrations microservice HTTP surface */
@Global()
@Module({
  imports: [HandoffCoreModule],
  controllers: [HandoffController],
  exports: [HandoffCoreModule],
})
export class HandoffModule {}
