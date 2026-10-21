import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthModule } from '@htveridoc/shared/auth/jwt-auth.module';
import { Document } from '@htveridoc/db/documents/entities/document.entity';
import { OrganizationUser } from '@htveridoc/db/users/entities/organization-user.entity';
import { User } from '@htveridoc/db/users/entities/user.entity';
import { DocumentQueuesController } from './document-queues.controller';
import { DocumentQueuesService } from './document-queues.service';
import { DocumentQueueMember } from '@htveridoc/db/document-queues/entities/document-queue-member.entity';
import { DocumentQueue } from '@htveridoc/db/document-queues/entities/document-queue.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentQueue,
      DocumentQueueMember,
      Document,
      OrganizationUser,
      User,
    ]),
    JwtAuthModule,
  ],
  controllers: [DocumentQueuesController],
  providers: [DocumentQueuesService],
  exports: [DocumentQueuesService],
})
export class DocumentQueuesModule {}
