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

export interface QueueJobAttemptDto {
  attempt: number;
  status: 'failed' | 'succeeded' | 'running' | 'pending';
  error: string | null;
}

export interface QueueJobDto {
  id: string;
  name: string;
  queue: QueueName;
  documentId: string | null;
  organizationId: string | null;
  state: string;
  failedReason: string | null;
  attemptsMade: number;
  attemptsMax: number;
  /** Human summary, e.g. "3 attempts: 2 failed, then succeeded". */
  attemptsSummary: string;
  /** Per-attempt timeline reconstructed from BullMQ stacktrace + final state. */
  attempts: QueueJobAttemptDto[];
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
    const attemptsMax = Math.max(1, Number(job.opts?.attempts ?? 1));
    const attemptsMade = Math.max(0, Number(job.attemptsMade ?? 0));
    const stacktrace = Array.isArray(job.stacktrace) ? job.stacktrace : [];
    const failedReason = job.failedReason?.trim() || null;
    const attempts = this.buildAttempts(
      state,
      attemptsMade,
      attemptsMax,
      stacktrace,
      failedReason,
    );
    return {
      id: String(job.id),
      name: job.name,
      queue,
      documentId: data.documentId ?? null,
      organizationId: data.organizationId ?? null,
      state,
      failedReason,
      attemptsMade,
      attemptsMax,
      attemptsSummary: this.buildAttemptsSummary(state, attempts, attemptsMax),
      attempts,
      timestamp: job.timestamp ?? null,
      processedOn: job.processedOn ?? null,
      finishedOn: job.finishedOn ?? null,
    };
  }

  /**
   * BullMQ keeps one stacktrace entry per failed attempt and leaves
   * `failedReason` set even after a later attempt succeeds. Reconstruct a
   * simple timeline so ops can see "2 failed → 3rd succeeded".
   */
  private buildAttempts(
    state: string,
    attemptsMade: number,
    attemptsMax: number,
    stacktrace: string[],
    failedReason: string | null,
  ): QueueJobAttemptDto[] {
    const errors = stacktrace.map((entry) => this.stacktraceMessage(entry));
    // Prefer failedReason for the latest failure when present.
    if (failedReason && errors.length > 0) {
      errors[errors.length - 1] = failedReason;
    } else if (failedReason && errors.length === 0 && state === 'failed') {
      errors.push(failedReason);
    }

    const attempts: QueueJobAttemptDto[] = [];

    if (state === 'completed') {
      const failedCount = errors.length;
      for (let i = 0; i < failedCount; i++) {
        attempts.push({
          attempt: i + 1,
          status: 'failed',
          error: errors[i] ?? null,
        });
      }
      const successAttempt = Math.max(failedCount + 1, attemptsMade || 1);
      attempts.push({
        attempt: successAttempt,
        status: 'succeeded',
        error: null,
      });
      return attempts;
    }

    if (state === 'failed') {
      const count = Math.max(errors.length, attemptsMade, 1);
      for (let i = 0; i < count; i++) {
        attempts.push({
          attempt: i + 1,
          status: 'failed',
          error: errors[i] ?? (i === count - 1 ? failedReason : null),
        });
      }
      return attempts;
    }

    if (state === 'active') {
      for (let i = 0; i < errors.length; i++) {
        attempts.push({
          attempt: i + 1,
          status: 'failed',
          error: errors[i] ?? null,
        });
      }
      attempts.push({
        attempt: errors.length + 1,
        status: 'running',
        error: null,
      });
      return attempts;
    }

    // waiting / delayed / unknown
    for (let i = 0; i < errors.length; i++) {
      attempts.push({
        attempt: i + 1,
        status: 'failed',
        error: errors[i] ?? null,
      });
    }
    const next = Math.min(errors.length + 1, attemptsMax);
    if (attempts.length === 0 || attempts[attempts.length - 1].attempt < next) {
      attempts.push({
        attempt: next,
        status: 'pending',
        error: null,
      });
    }
    return attempts;
  }

  private buildAttemptsSummary(
    state: string,
    attempts: QueueJobAttemptDto[],
    attemptsMax: number,
  ): string {
    const failed = attempts.filter((a) => a.status === 'failed').length;
    const succeeded = attempts.some((a) => a.status === 'succeeded');
    const running = attempts.some((a) => a.status === 'running');

    if (state === 'completed' && succeeded) {
      if (failed === 0) {
        return `Succeeded on attempt 1 of ${attemptsMax}`;
      }
      return `${failed + 1} attempts: ${failed} failed, then succeeded`;
    }
    if (state === 'failed') {
      return `Failed after ${Math.max(failed, 1)} of ${attemptsMax} attempts`;
    }
    if (running) {
      return failed > 0
        ? `Attempt ${failed + 1} of ${attemptsMax} running (${failed} failed earlier)`
        : `Attempt 1 of ${attemptsMax} running`;
    }
    if (failed > 0) {
      return `Waiting to retry (attempt ${failed + 1} of ${attemptsMax})`;
    }
    return `Up to ${attemptsMax} attempts`;
  }

  private stacktraceMessage(entry: string): string {
    const first = entry.split('\n').map((l) => l.trim()).find(Boolean);
    if (!first) return 'Attempt failed';
    // "Error: message" or "ServiceUnavailableException: message"
    const matched = first.match(/^[A-Za-z0-9_$]*Error:\s*(.+)$/);
    if (matched?.[1]) return matched[1].trim();
    const named = first.match(/^[A-Za-z0-9_$]+Exception:\s*(.+)$/);
    if (named?.[1]) return named[1].trim();
    return first.length > 240 ? `${first.slice(0, 237)}…` : first;
  }
}
