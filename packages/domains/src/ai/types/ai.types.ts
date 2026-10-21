export const GEMINI_FLASH_PREVIEW = 'gemini-3-flash-preview';

export type AiEventLogger = (
  step: string,
  message: string,
  options?: {
    level?: 'info' | 'warn' | 'error' | 'success';
    meta?: Record<string, unknown>;
  },
) => Promise<void>;

export interface AiExtractRequest {
  documentId: string;
  organizationId: string;
  documentType: string;
  pdfBuffer: Buffer;
  fileName: string;
  onEvent?: AiEventLogger;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AiExtractResult {
  model: string;
  promptVersion: string;
  schemaVersion: string;
  rawText: string;
  data: unknown;
  usage: AiUsage;
  processingTimeMs: number;
}

export interface AiProvider {
  readonly name: string;
  extractDocument(request: AiExtractRequest): Promise<AiExtractResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
