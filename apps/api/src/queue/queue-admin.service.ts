import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { AI_EXTRACTION_QUEUE } from '../processing/ai-extraction.processor';
import { DOCUMENT_EXPORT_QUEUE } from '../integrations/export/document-export.queue';
import { QUEUE_ENABLED } from './redis-compat';

export type QueueName = 'ai-extraction' | 'document-export';

export interface QueueJobDto {
  id: string;
  name: string;
  queue: QueueName;
  documentId: string | null;
  organizationId: string | null;
  state: string;
  failedReason: string | null;
  attemptsMade: number;
  timestamp: number | null;
  processedOn: number | null;
  finishedOn: number | null;
}

export interface QueueStatusDto {
  enabled: boolean;
  reason?: string;
  queues: QueueName[];
  jobs: QueueJobDto[];
}

const QUEUE_NAMES: QueueName[] = ['ai-extraction', 'document-export'];

@Injectable()
export class QueueAdminService {
  constructor(
    @Inject(QUEUE_ENABLED) private readonly queueEnabled: boolean,
    private readonly moduleRef: ModuleRef,
  ) {}

  async listJobs(
    organizationId: string,
    options?: { limit?: number; failedOnly?: boolean },
  ): Promise<QueueStatusDto> {
    if (!this.queueEnabled) {
      return {
        enabled: false,
        reason:
          'BullMQ is disabled (Redis unavailable or incompatible). Extraction runs inline — queue UI unavailable.',
        queues: QUEUE_NAMES,
        jobs: [],
      };
    }

    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const failedOnly = Boolean(options?.failedOnly);
    const jobs: QueueJobDto[] = [];

    for (const queueName of QUEUE_NAMES) {
      const queue = this.resolveQueue(queueName);
      if (!queue) continue;

      const fetched = failedOnly
        ? await queue.getJobs(['failed'], 0, limit - 1)
        : await queue.getJobs(
            ['active', 'waiting', 'delayed', 'failed', 'completed'],
            0,
            limit - 1,
          );

      for (const job of fetched) {
        const dto = await this.toDto(queueName, job);
        if (dto.organizationId && dto.organizationId !== organizationId) {
          continue;
        }
        // Jobs without org (legacy) are hidden from org-scoped UI
        if (!dto.organizationId) continue;
        jobs.push(dto);
      }
    }

    jobs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return {
      enabled: true,
      queues: QUEUE_NAMES,
      jobs: jobs.slice(0, limit),
    };
  }

  async retryJob(
    organizationId: string,
    queueName: QueueName,
    jobId: string,
  ): Promise<{ ok: true; jobId: string; state: string }> {
    if (!this.queueEnabled) {
      throw new ServiceUnavailableException(
        'Queue is disabled (inline mode). Retry is unavailable.',
      );
    }

    if (!QUEUE_NAMES.includes(queueName)) {
      throw new NotFoundException(`Unknown queue: ${queueName}`);
    }

    const queue = this.resolveQueue(queueName);
    if (!queue) {
      throw new ServiceUnavailableException(`Queue ${queueName} is not registered`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const data = job.data as { organizationId?: string };
    if (data.organizationId !== organizationId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    if (state !== 'failed') {
      throw new BadRequestException(
        `Job is ${state}; only failed jobs can be retried`,
      );
    }

    await job.retry();
    const refreshed = await queue.getJob(jobId);
    const newState = refreshed ? await refreshed.getState() : 'waiting';
    return { ok: true, jobId, state: newState };
  }

  private resolveQueue(name: QueueName): Queue | null {
    const token =
      name === 'ai-extraction'
        ? getQueueToken(AI_EXTRACTION_QUEUE)
        : getQueueToken(DOCUMENT_EXPORT_QUEUE);
    try {
      return this.moduleRef.get<Queue>(token, { strict: false });
    } catch {
      return null;
    }
  }

  private async toDto(queue: QueueName, job: Job): Promise<QueueJobDto> {
    const data = (job.data ?? {}) as {
      documentId?: string;
      organizationId?: string;
    };
    const state = await job.getState();
    return {
      id: String(job.id),
      name: job.name,
      queue,
      documentId: data.documentId ?? null,
      organizationId: data.organizationId ?? null,
      state,
      failedReason: job.failedReason ?? null,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp ?? null,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
    };
  }
}
