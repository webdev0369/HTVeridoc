import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { resolvePrompt } from '../prompts/prompt.registry';
import {
  lineItemSchema,
  poConfirmationExtractionSchema,
  type PoConfirmationExtraction,
} from '../schemas/po-confirmation.schema';
import {
  AiExtractRequest,
  AiExtractResult,
  AiEventLogger,
  AiProvider,
  AiUsage,
  GEMINI_FLASH_PREVIEW,
} from '../types/ai.types';
import { z } from 'zod';

/** gemini-3-flash-preview list pricing (USD per 1M tokens) */
const INPUT_COST_PER_M = 0.5;
const OUTPUT_COST_PER_M = 3.0;
const MAX_ATTEMPTS = 3;
/** Gemini 3 output cap — thinking tokens count against this budget. */
const MAX_OUTPUT_TOKENS = 65536;

const lineItemsOnlySchema = z.object({
  lineItems: z.array(lineItemSchema).default([]),
});

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

    // Truncated responses used to sanitize by chopping at the last `}`, which
    // dropped partial lineItems and validated as 0 lines. Prefer repair.
    parsed = await this.recoverLineItemsIfTruncated(workingRaw, parsed, emit);

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

    let extractionData: PoConfirmationExtraction = validated.data;

    // Truncated / thin lineItems: full-doc regenerate often hits the same
    // thinking-token wall. Prefer a dedicated compact line-items pass.
    const needsLineItemsPass =
      this.rawLooksLikeTruncatedLineItems(workingRaw) ||
      (extractionData.lineItems?.length ?? 0) < 2;

    if (needsLineItemsPass) {
      const recoveredCount = extractionData.lineItems?.length ?? 0;
      await emit(
        'LINE_ITEMS_PASS',
        `Line items incomplete (${recoveredCount}) — running dedicated line-items extraction…`,
        { level: 'warn', meta: { recoveredLineItems: recoveredCount } },
      );
      try {
        const merged = await this.extractAndMergeLineItems(
          client,
          request,
          extractionData,
          emit,
        );
        if (
          (merged.data.lineItems?.length ?? 0) > recoveredCount ||
          (merged.data.lineItems?.length ?? 0) >= 2
        ) {
          extractionData = merged.data;
          workingRaw = merged.rawText || workingRaw;
          if (merged.response) workingResponse = merged.response;
        } else {
          await emit(
            'LINE_ITEMS_PASS_KEPT',
            'Line-items pass did not improve count — keeping prior payload',
            { level: 'warn', meta: { recoveredLineItems: recoveredCount } },
          );
        }
      } catch (lineErr) {
        await emit(
          'LINE_ITEMS_PASS_FAILED',
          `Line-items pass failed (${
            lineErr instanceof Error ? lineErr.message : 'error'
          }) — keeping ${recoveredCount} recovered line item(s)`,
          {
            level: 'warn',
            meta: { recoveredLineItems: recoveredCount },
          },
        );
      }
    }

    const lineCount = extractionData.lineItems?.length ?? 0;
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
      data: extractionData,
      usage,
      processingTimeMs,
    };
  }

  /**
   * Gemini 3 Flash defaults to high thinking; those tokens count against
   * maxOutputTokens and routinely truncate long lineItems JSON. Keep thinking
   * low and raise the output cap so the full table can fit.
   */
  private generationConfig() {
    return {
      responseMimeType: 'application/json' as const,
      temperature: 0.1,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // SDK typings may lag Gemini 3 — cast keeps runtime config intact.
      thinkingConfig: {
        thinkingLevel: 'low',
      },
    } as Record<string, unknown>;
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
          config: this.generationConfig(),
        });
        const finishReason =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (response as any)?.candidates?.[0]?.finishReason ?? null;
        await emit(
          'GEMINI_OK',
          `Gemini responded on attempt ${attempt}`,
          {
            level: 'success',
            meta: {
              attempt,
              finishReason,
              outputTokens:
                response.usageMetadata?.candidatesTokenCount ?? 0,
              thoughtsTokens:
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (response.usageMetadata as any)?.thoughtsTokenCount ?? null,
            },
          },
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

  /**
   * Compact second pass: only `{ lineItems: [...] }` so a long table is less
   * likely to be truncated. Merges into the header already extracted.
   */
  private async extractAndMergeLineItems(
    client: GoogleGenAI,
    request: AiExtractRequest,
    headerData: PoConfirmationExtraction,
    emit: AiEventLogger,
  ): Promise<{
    data: PoConfirmationExtraction;
    rawText: string;
    response: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>> | null;
  }> {
    const linePrompt = `Extract EVERY line item from this purchase order confirmation PDF (all pages).
Return JSON only in this exact shape:
{
  "lineItems": [
    {
      "position": number|null,
      "articleNumber": string|null,
      "description": string|null,
      "brand": string|null,
      "quantity": number|null,
      "purchaseQuantity": number|null,
      "stockTakingQuantity": number|null,
      "packaging": string|null,
      "packageQuantity": number|null,
      "unit": string|null,
      "purchaseUnit": string|null,
      "stocktakingUnit": string|null,
      "stockTakingQuantityPerPurchaseUnit": number|null,
      "unitPrice": number|null,
      "stocktakingUnitPrice": number|null,
      "discount": number|null,
      "amount": number|null,
      "expectedDelivery": string|null,
      "lineType": "PRODUCT"|"FEE"|"NOTE"|"CANCELLED"|"UNKNOWN",
      "confidence": number,
      "source": { "page": number }
    }
  ]
}

Rules:
- Include every product / fee / cancelled row — do not stop after the first line.
- Prefer compact values; omit null fields when possible.
- packaging = full Pakning text (e.g. "PK á 200 STK").
- purchaseQuantity from Antall/Kvt; stockTakingQuantityPerPurchaseUnit from á N in Pakning.
- File: ${request.fileName}`;

    await emit(
      'GEMINI_REQUEST',
      'Calling Gemini for line-items-only pass…',
      { meta: { pass: 'lineItems' } },
    );

    const response = await client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: linePrompt },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: request.pdfBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
      config: this.generationConfig(),
    });

    const rawText = (response.text || '').trim();
    await emit(
      'GEMINI_RESPONSE',
      `Line-items pass response (${rawText.length} chars)`,
      {
        meta: {
          responseChars: rawText.length,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
          pass: 'lineItems',
        },
      },
    );

    if (!rawText) {
      return { data: headerData, rawText: '', response: null };
    }

    let parsed = this.parseJson(rawText);
    parsed = await this.recoverLineItemsIfTruncated(rawText, parsed, emit);

    // Accept either `{ lineItems: [...] }` or a bare array.
    const asObject =
      Array.isArray(parsed) ? { lineItems: parsed } : parsed;
    const linesOnly = lineItemsOnlySchema.safeParse(asObject);
    if (!linesOnly.success || linesOnly.data.lineItems.length === 0) {
      return { data: headerData, rawText, response };
    }

    const merged: PoConfirmationExtraction = {
      ...headerData,
      lineItems: linesOnly.data.lineItems,
    };
    const revalidated = poConfirmationExtractionSchema.safeParse(merged);
    if (!revalidated.success) {
      return { data: headerData, rawText, response };
    }

    await emit(
      'LINE_ITEMS_PASS_OK',
      `Line-items pass recovered ${revalidated.data.lineItems.length} rows`,
      {
        level: 'success',
        meta: { lineItemCount: revalidated.data.lineItems.length },
      },
    );

    return {
      data: revalidated.data,
      rawText,
      response,
    };
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
    // Prefer the candidate that yields the most lineItems. A truncated Gemini
    // payload often "successfully" parses after chopping at the last `}` —
    // which silently drops partial lineItems — while repair recovers them.
    const extracted = this.extractJsonCandidate(rawText);
    const candidates = [
      this.sanitizeJsonText(rawText),
      this.repairTruncatedJson(this.sanitizeJsonText(rawText)),
      this.repairTruncatedJson(extracted),
      // Drop a broken trailing line-item object, then close braces — recovers
      // long responses that fail with "Expected ',' or ']' after array element".
      this.repairTruncatedJson(this.truncateToLastCompleteLineItem(extracted)),
    ];

    let lastDetail = 'parse error';
    let best: unknown;
    let bestLineCount = -1;
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate) as unknown;
        const lineCount = this.countLineItems(parsed);
        if (lineCount > bestLineCount) {
          best = parsed;
          bestLineCount = lineCount;
        }
      } catch (err) {
        lastDetail = err instanceof Error ? err.message : 'parse error';
      }
    }

    if (best !== undefined) return best;

    throw new BadRequestException(
      `Gemini response was not valid JSON (${lastDetail})`,
    );
  }

  private countLineItems(parsed: unknown): number {
    if (!parsed || typeof parsed !== 'object') return 0;
    const items = (parsed as { lineItems?: unknown }).lineItems;
    return Array.isArray(items) ? items.length : 0;
  }

  /**
   * When sanitize produced a headers-only object but the raw text still
   * contains a truncated `lineItems` array, force-repair and recover rows.
   */
  private async recoverLineItemsIfTruncated(
    rawText: string,
    parsed: unknown,
    emit: AiEventLogger,
  ): Promise<unknown> {
    if (this.countLineItems(parsed) > 0) return parsed;
    if (!this.rawLooksLikeTruncatedLineItems(rawText)) return parsed;

    try {
      const repaired = this.repairTruncatedJson(
        this.extractJsonCandidate(rawText),
      );
      const recovered = JSON.parse(repaired) as unknown;
      const recoveredCount = this.countLineItems(recovered);
      if (recoveredCount > 0) {
        await emit(
          'LINE_ITEMS_RECOVERED',
          `Recovered ${recoveredCount} line item(s) from truncated Gemini JSON`,
          { level: 'warn', meta: { lineItemCount: recoveredCount } },
        );
        return recovered;
      }
    } catch {
      // keep original parse
    }
    return parsed;
  }

  /** True when raw JSON opened a lineItems array but never closed cleanly. */
  private rawLooksLikeTruncatedLineItems(raw: string): boolean {
    const text = this.extractJsonCandidate(raw);
    if (!/"lineItems"\s*:\s*\[\s*\{/.test(text)) return false;
    return !this.isJsonStructurallyClosed(text);
  }

  /**
   * Keep header + complete lineItems objects only. Drops a trailing partial
   * row that often breaks parse with "Expected ',' or ']' after array element".
   */
  private truncateToLastCompleteLineItem(text: string): string {
    const marker = '"lineItems"';
    const idx = text.indexOf(marker);
    if (idx < 0) return text;
    const arrayStart = text.indexOf('[', idx + marker.length);
    if (arrayStart < 0) return text;

    let inString = false;
    let escaped = false;
    let objDepth = 0;
    let arrayDepth = 1;
    let lastCompleteEnd = -1;

    for (let i = arrayStart + 1; i < text.length; i++) {
      const ch = text[i];
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
      if (ch === '{') objDepth += 1;
      else if (ch === '}') {
        objDepth -= 1;
        if (objDepth === 0 && arrayDepth === 1) {
          lastCompleteEnd = i;
        }
      } else if (ch === '[') arrayDepth += 1;
      else if (ch === ']') {
        arrayDepth -= 1;
        if (arrayDepth === 0) break;
      }
    }

    if (lastCompleteEnd < 0) {
      // No complete row — keep an empty lineItems array for repair to close.
      return `${text.slice(0, arrayStart + 1)}`;
    }
    return text.slice(0, lastCompleteEnd + 1);
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

  /**
   * Strip fences / trailing commas / control chars that models sometimes emit.
   *
   * IMPORTANT: do NOT chop at lastIndexOf('}') when the payload is truncated.
   * Truncated responses often still contain earlier `}` (e.g. party objects);
   * chopping there silently drops the partial `lineItems` array and yields 0 lines.
   */
  private sanitizeJsonText(raw: string): string {
    let text = this.extractJsonCandidate(raw);
    if (this.isJsonStructurallyClosed(text)) {
      const end = text.lastIndexOf('}');
      if (end > 0) {
        text = text.slice(0, end + 1);
      }
    }
    text = this.escapeControlCharsInStrings(text);
    // Remove trailing commas before } or ] (common LLM mistake).
    text = text.replace(/,\s*([}\]])/g, '$1');
    return text;
  }

  /** True when braces/brackets are balanced and we are not mid-string. */
  private isJsonStructurallyClosed(text: string): boolean {
    const stack: Array<'{' | '['> = [];
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
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
        else return false;
      } else if (ch === ']') {
        if (stack[stack.length - 1] === '[') stack.pop();
        else return false;
      }
    }
    return !inString && stack.length === 0;
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

    // Drop trailing incomplete key/value fragments (max-token truncation).
    // Also strip value-less keys before premature closers: `"quantity":}]}`.
    // Do NOT use a pattern that matches a complete `"key": "value"` at EOF —
    // that silently deletes the last valid property.
    cleaned = cleaned.replace(/,\s*"[^"]*"\s*:\s*(?=[}\]])/g, '');
    cleaned = cleaned.replace(/"[^"]*"\s*:\s*(?=[}\]])/g, '');
    cleaned = cleaned.replace(/,\s*"[^"]*"\s*:\s*"[^"\\]*(?:\\.[^"\\]*)*$/, '');
    cleaned = cleaned.replace(/,\s*"[^"]*"\s*:\s*[^"{\[\],}\s][^,}\]]*$/, '');
    cleaned = cleaned.replace(/,\s*"[^"]*"\s*:\s*$/, '');
    cleaned = cleaned.replace(/"[^"]*"\s*:\s*$/, '');
    cleaned = cleaned.replace(/,\s*\{[^}]*$/, '');
    cleaned = cleaned.replace(/,\s*$/, '');
    // Incomplete first property after `{` with no leading comma.
    cleaned = cleaned.replace(/\{\s*"[^"]*"\s*:\s*$/, '{');
    // Drop a trailing empty object left after stripping its only incomplete key.
    cleaned = cleaned.replace(/,\s*\{\s*$/, '');
    cleaned = cleaned.replace(/\[\s*\{\s*$/, '[');

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
