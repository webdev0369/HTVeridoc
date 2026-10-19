import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Document } from '../documents/entities/document.entity';
import { OrganizationUser } from '../users/entities/organization-user.entity';
import { User } from '../users/entities/user.entity';
import { DocumentQueuesController } from './document-queues.controller';
import { DocumentQueuesService } from './document-queues.service';
import { DocumentQueueMember } from './entities/document-queue-member.entity';
import { DocumentQueue } from './entities/document-queue.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DocumentQueue,
      DocumentQueueMember,
      Document,
      OrganizationUser,
      User,
    ]),
    AuthModule,
  ],
  controllers: [DocumentQueuesController],
  providers: [DocumentQueuesService],
  exports: [DocumentQueuesService],
})
export class DocumentQueuesModule {}
