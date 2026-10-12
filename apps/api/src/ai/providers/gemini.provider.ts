import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { resolvePrompt } from '../prompts/prompt.registry';
import { poConfirmationExtractionSchema } from '../schemas/po-confirmation.schema';
import {
  AiExtractRequest,
  AiExtractResult,
  AiEventLogger,
  AiProvider,
  AiUsage,
  GEMINI_FLASH_PREVIEW,
} from '../types/ai.types';

/** gemini-3-flash-preview list pricing (USD per 1M tokens) */
const INPUT_COST_PER_M = 0.5;
const OUTPUT_COST_PER_M = 3.0;
const MAX_ATTEMPTS = 3;

@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.model =
      this.config.get<string>('GEMINI_MODEL') || GEMINI_FLASH_PREVIEW;
  }

  async extractDocument(request: AiExtractRequest): Promise<AiExtractResult> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured. Set it in apps/api/.env (or repo-root .env) and restart the API.',
      );
    }

    const prompt = resolvePrompt(request.documentType, request.fileName);
    const client = new GoogleGenAI({ apiKey });
    const started = Date.now();
    const emit = request.onEvent ?? (async () => undefined);

    await emit('GEMINI_PREPARE', `Using model ${this.model}`, {
      meta: {
        model: this.model,
        promptVersion: prompt.promptVersion,
        schemaVersion: prompt.schemaVersion,
        pdfBytes: request.pdfBuffer.length,
      },
    });

    this.logger.log(
      `Extracting document ${request.documentId} with ${this.model} (prompt ${prompt.promptVersion}, pdf ${request.pdfBuffer.length} bytes)`,
    );

    let response;
    try {
      response = await this.generateWithRetry(client, prompt, request, emit);
    } catch (err) {
      const message = this.formatError(err);
      await emit('GEMINI_FAILED', message, { level: 'error' });
      this.logger.error(`Gemini failed for ${request.documentId}: ${message}`);
      throw new ServiceUnavailableException(
        `Gemini extraction failed: ${message}`,
      );
    }

    const rawText = (response.text || '').trim();
    if (!rawText) {
      await emit('GEMINI_EMPTY', 'Gemini returned an empty response', {
        level: 'error',
      });
      throw new BadRequestException('Gemini returned an empty response');
    }

    await emit(
      'GEMINI_RESPONSE',
      `Received response (${rawText.length} chars)`,
      {
        meta: {
          responseChars: rawText.length,
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        },
      },
    );

    let workingRaw = rawText;
    let workingResponse = response;
    let parsed: unknown;
    try {
      parsed = this.parseJson(workingRaw);
    } catch (parseErr) {
      // Malformed / truncated JSON is common on long invoices — regenerate once.
      await emit(
        'JSON_REPAIR_RETRY',
        `Invalid JSON (${parseErr instanceof Error ? parseErr.message : 'parse error'}) — regenerating once…`,
        { level: 'warn' },
      );
      workingResponse = await this.generateWithRetry(
        client,
        prompt,
        request,
        emit,
      );
      workingRaw = (workingResponse.text || '').trim();
      if (!workingRaw) {
        throw new BadRequestException('Gemini returned an empty response');
      }
      await emit(
        'GEMINI_RESPONSE',
        `Received retry response (${workingRaw.length} chars)`,
        {
          meta: {
            responseChars: workingRaw.length,
            inputTokens: workingResponse.usageMetadata?.promptTokenCount ?? 0,
            outputTokens:
              workingResponse.usageMetadata?.candidatesTokenCount ?? 0,
          },
        },
      );
      parsed = this.parseJson(workingRaw);
    }

    const validated = poConfirmationExtractionSchema.safeParse(parsed);
    if (!validated.success) {
      await emit(
        'SCHEMA_INVALID',
        `Schema validation failed: ${validated.error.message}`,
        { level: 'error' },
      );
      throw new BadRequestException(
        `Gemini response failed schema validation: ${validated.error.message}`,
      );
    }

    const lineCount = validated.data.lineItems?.length ?? 0;
    await emit(
      'SCHEMA_VALID',
      `Validated PO confirmation JSON (${lineCount} line items)`,
      {
        level: 'success',
        meta: { lineItemCount: lineCount },
      },
    );

    const usage = this.toUsage(workingResponse.usageMetadata);
    const processingTimeMs = Date.now() - started;

    return {
      model: this.model,
      promptVersion: prompt.promptVersion,
      schemaVersion: prompt.schemaVersion,
      rawText: workingRaw,
      data: validated.data,
      usage,
      processingTimeMs,
    };
  }

  private async generateWithRetry(
    client: GoogleGenAI,
    prompt: ReturnType<typeof resolvePrompt>,
    request: AiExtractRequest,
    emit: AiEventLogger,
  ) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await emit(
        'GEMINI_REQUEST',
        `Calling Gemini (attempt ${attempt}/${MAX_ATTEMPTS})…`,
        { meta: { attempt, maxAttempts: MAX_ATTEMPTS } },
      );
      try {
        const response = await client.models.generateContent({
          model: this.model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${prompt.systemPrompt}\n\n${prompt.userPrompt}` },
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: request.pdfBuffer.toString('base64'),
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            // Long invoices with many line items otherwise truncate mid-array.
            maxOutputTokens: 16384,
          },
        });
        await emit(
          'GEMINI_OK',
          `Gemini responded on attempt ${attempt}`,
          { level: 'success', meta: { attempt } },
        );
        return response;
      } catch (err) {
        lastError = err;
        const message = this.formatError(err);
        const retryable = this.isRetryable(err);
        await emit(
          'GEMINI_RETRY',
          `Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${message}${
            retryable && attempt < MAX_ATTEMPTS ? ' — retrying' : ''
          }`,
          {
            level: retryable && attempt < MAX_ATTEMPTS ? 'warn' : 'error',
            meta: { attempt, retryable },
          },
        );
        this.logger.warn(
          `Gemini attempt ${attempt}/${MAX_ATTEMPTS} failed (${message})${
            retryable && attempt < MAX_ATTEMPTS ? '; retrying…' : ''
          }`,
        );
        if (!retryable || attempt === MAX_ATTEMPTS) {
          throw err;
        }
        await this.delay(1000 * attempt);
      }
    }

    throw lastError;
  }

  private isRetryable(err: unknown): boolean {
    const message = this.formatError(err).toLowerCase();
    return (
      message.includes('fetch failed') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up') ||
      message.includes('network') ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('500')
    );
  }

  private formatError(err: unknown): string {
    if (!(err instanceof Error)) {
      return 'Gemini request failed';
    }
    const parts = [err.message];
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) {
      parts.push(`cause=${cause.message}`);
    } else if (typeof cause === 'string') {
      parts.push(`cause=${cause}`);
    }
    const status = (err as { status?: number }).status;
    if (status) {
      parts.push(`status=${status}`);
    }
    return parts.join(' | ');
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseJson(rawText: string): unknown {
    const candidates = [
      this.sanitizeJsonText(rawText),
      this.repairTruncatedJson(this.sanitizeJsonText(rawText)),
    ];
    // Also try repairing the raw slice without lastIndexOf('}') trim —
    // truncated payloads often have no closing brace yet.
    candidates.push(
      this.repairTruncatedJson(this.extractJsonCandidate(rawText)),
    );

    let lastDetail = 'parse error';
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        return JSON.parse(candidate);
      } catch (err) {
        lastDetail = err instanceof Error ? err.message : 'parse error';
      }
    }

    throw new BadRequestException(
      `Gemini response was not valid JSON (${lastDetail})`,
    );
  }

  private extractJsonCandidate(raw: string): string {
    let text = raw.trim();
    if (text.startsWith('```')) {
      text = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    }
    const start = text.indexOf('{');
    if (start < 0) return text;
    return text.slice(start);
  }

  /** Strip fences / trailing commas / control chars that models sometimes emit. */
  private sanitizeJsonText(raw: string): string {
    let text = this.extractJsonCandidate(raw);
    const end = text.lastIndexOf('}');
    if (end > 0) {
      text = text.slice(0, end + 1);
    }
    text = this.escapeControlCharsInStrings(text);
    // Remove trailing commas before } or ] (common LLM mistake).
    text = text.replace(/,\s*([}\]])/g, '$1');
    return text;
  }

  /**
   * Escape raw newlines/tabs inside JSON strings so JSON.parse can succeed.
   */
  private escapeControlCharsInStrings(text: string): string {
    let out = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          out += ch;
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          out += ch;
          escaped = true;
          continue;
        }
        if (ch === '"') {
          out += ch;
          inString = false;
          continue;
        }
        if (ch === '\n') {
          out += '\\n';
          continue;
        }
        if (ch === '\r') {
          out += '\\r';
          continue;
        }
        if (ch === '\t') {
          out += '\\t';
          continue;
        }
        // Drop other control characters
        if (ch.charCodeAt(0) < 0x20) {
          continue;
        }
        out += ch;
        continue;
      }
      if (ch === '"') {
        inString = true;
      }
      out += ch;
    }
    return out;
  }

  /**
   * Close truncated JSON (common when output hits token limit mid-lineItems).
   * Walks the text, tracks open braces/brackets/strings, then appends closers.
   */
  private repairTruncatedJson(text: string): string {
    let cleaned = this.escapeControlCharsInStrings(text.trim());
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    const stack: Array<'{' | '['> = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') stack.push('{');
      else if (ch === '[') stack.push('[');
      else if (ch === '}') {
        if (stack[stack.length - 1] === '{') stack.pop();
      } else if (ch === ']') {
        if (stack[stack.length - 1] === '[') stack.pop();
      }
    }

    // Drop a trailing incomplete key/value fragment after the last comma/colon.
    cleaned = cleaned.replace(/,\s*"[^"]*"\s*:\s*("([^"\\]|\\.)*)?$/, '');
    cleaned = cleaned.replace(/,\s*\{[^}]*$/, '');
    cleaned = cleaned.replace(/,\s*$/, '');

    if (inString) {
      cleaned += '"';
    }

    // Recompute stack after fragment trim
    const stack2: Array<'{' | '['> = [];
    inString = false;
    escaped = false;
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') stack2.push('{');
      else if (ch === '[') stack2.push('[');
      else if (ch === '}') {
        if (stack2[stack2.length - 1] === '{') stack2.pop();
      } else if (ch === ']') {
        if (stack2[stack2.length - 1] === '[') stack2.pop();
      }
    }
    if (inString) cleaned += '"';

    cleaned = cleaned.replace(/,\s*$/, '');
    while (stack2.length) {
      const open = stack2.pop();
      cleaned += open === '{' ? '}' : ']';
    }

    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    return cleaned;
  }

  private toUsage(meta: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | undefined): AiUsage {
    const inputTokens = meta?.promptTokenCount ?? 0;
    const outputTokens = meta?.candidatesTokenCount ?? 0;
    const totalTokens = meta?.totalTokenCount ?? inputTokens + outputTokens;
    const estimatedCostUsd =
      (inputTokens / 1_000_000) * INPUT_COST_PER_M +
      (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    };
  }
}
