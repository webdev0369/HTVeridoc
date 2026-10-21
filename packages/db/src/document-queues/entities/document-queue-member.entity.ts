import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { DocumentQueue } from './document-queue.entity';

@Entity('document_queue_members')
@Index(['userId'])
export class DocumentQueueMember {
  @PrimaryColumn({ name: 'queue_id', type: 'uuid' })
  queueId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => DocumentQueue, (q) => q.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'queue_id' })
  queue!: DocumentQueue;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
