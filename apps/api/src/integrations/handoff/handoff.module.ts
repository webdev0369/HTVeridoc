import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module';
import { Document } from '../../documents/entities/document.entity';
import { Extraction } from '../../extraction/entities/extraction.entity';
import { ExtractionField } from '../../extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '../../extraction/entities/extraction-line-item.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { CredentialsService } from './credentials.service';
import { EditorLinkService } from './editor-link.service';
import { HandoffController } from './handoff.controller';
import { HandoffDispatchService } from './handoff-dispatch.service';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookEndpointService } from './webhook-endpoint.service';

@Global()
@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      WebhookEndpoint,
      Organization,
      Document,
      Extraction,
      ExtractionField,
      ExtractionLineItem,
    ]),
  ],
  controllers: [HandoffController],
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
export class HandoffModule {}
