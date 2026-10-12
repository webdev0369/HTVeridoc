import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_requests')
@Index(['organizationId', 'createdAt'])
@Index(['documentId'])
export class AiRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 128 })
  model!: string;

  @Column({ name: 'prompt_version', type: 'varchar', length: 32 })
  promptVersion!: string;

  @Column({ name: 'schema_version', type: 'varchar', length: 32 })
  schemaVersion!: string;

  @Column({ name: 'input_tokens', type: 'int', default: 0 })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'int', default: 0 })
  outputTokens!: number;

  @Column({ name: 'total_tokens', type: 'int', default: 0 })
  totalTokens!: number;

  @Column({
    name: 'estimated_cost_usd',
    type: 'numeric',
    precision: 12,
    scale: 6,
    default: 0,
  })
  estimatedCostUsd!: string;

  @Column({ name: 'processing_time_ms', type: 'int', default: 0 })
  processingTimeMs!: number;

  @Column({ type: 'varchar', length: 32 })
  status!: 'success' | 'failed';

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
