import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiRequest } from '@htveridoc/db/ai/entities/ai-request.entity';
import {
  AI_PROVIDER,
  AiExtractRequest,
  AiExtractResult,
  AiProvider,
} from './types/ai.types';

@Injectable()
export class AiService {
  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    @InjectRepository(AiRequest)
    private readonly aiRequestsRepo: Repository<AiRequest>,
  ) {}

  async extractAndTrack(
    request: AiExtractRequest,
  ): Promise<AiExtractResult> {
    try {
      const result = await this.provider.extractDocument(request);
      await this.aiRequestsRepo.save(
        this.aiRequestsRepo.create({
          documentId: request.documentId,
          organizationId: request.organizationId,
          model: result.model,
          promptVersion: result.promptVersion,
          schemaVersion: result.schemaVersion,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          estimatedCostUsd: String(result.usage.estimatedCostUsd),
          processingTimeMs: result.processingTimeMs,
          status: 'success',
          errorMessage: null,
        }),
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI extraction failed';
      await this.aiRequestsRepo.save(
        this.aiRequestsRepo.create({
          documentId: request.documentId,
          organizationId: request.organizationId,
          model: this.provider.name,
          promptVersion: 'unknown',
          schemaVersion: 'unknown',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: '0',
          processingTimeMs: 0,
          status: 'failed',
          errorMessage: message,
        }),
      );
      throw err;
    }
  }

  async listCosts(organizationId: string, limit = 50) {
    return this.aiRequestsRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }
}
