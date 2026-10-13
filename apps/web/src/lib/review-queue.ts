import {
  getLineColumnValue,
  lineAnchorHints,
  lineSelectionLabel,
  visibleLineReviewColumns,
  type ReviewSelection,
} from '@/lib/review-types';
import type {
  ExtractionDto,
  FieldConfigItemDto,
  ValidationDto,
} from '@/lib/types';

type QueueItem = Exclude<ReviewSelection, null>;

function sameTarget(a: QueueItem, b: ReviewSelection): boolean {
  if (!b) return false;
  if (a.type !== b.type || a.id !== b.id) return false;
  if (a.type === 'line' && b.type === 'line') {
    return a.column === b.column;
  }
  return true;
}

/** Ordered review targets: header fields, then each line cell left → right. */
export function buildReviewQueue(
  extraction: ExtractionDto | undefined | null,
  fieldConfig: FieldConfigItemDto[] | undefined | null,
  validation?: ValidationDto | null,
): QueueItem[] {
  if (!extraction) return [];

  const fields = extraction.fields ?? [];
  const fieldMap = new Map(fields.map((f) => [f.fieldKey, f]));

  const configs = (fieldConfig ?? []).filter((f) => f.mode !== 'IGNORED');
  const orderedKeys = configs.length
    ? [...configs]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.fieldKey)
    : fields.map((f) => f.fieldKey);

  const errorFieldKeys = new Set(
    (validation?.errors ?? [])
      .map((e) => e.fieldKey)
      .filter((k): k is string => Boolean(k)),
  );
  const errorLineIds = new Set(
    (validation?.errors ?? [])
      .map((e) => e.lineItemId)
      .filter((k): k is string => Boolean(k)),
  );

  const queue: QueueItem[] = [];

  for (const key of orderedKeys) {
    const field = fieldMap.get(key);
    if (!field) continue;
    queue.push({
      type: 'field',
      id: field.id,
      label: field.fieldLabel,
      value: field.currentValue,
      page: field.source?.page ?? null,
      boundingBox: field.source?.boundingBox,
      tone: errorFieldKeys.has(field.fieldKey)
        ? 'error'
        : field.isUserEdited
          ? 'edited'
          : 'ai',
    });
  }

  const lines = [...(extraction.lineItems ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const lineColumns = visibleLineReviewColumns(lines);
  for (const line of lines) {
    const tone = errorLineIds.has(line.id)
      ? 'error'
      : line.isUserEdited
        ? 'edited'
        : 'ai';
    for (const column of lineColumns) {
      queue.push({
        type: 'line',
        id: line.id,
        column,
        label: lineSelectionLabel(line, column),
        value: getLineColumnValue(line, column),
        page: line.source?.page ?? null,
        boundingBox: line.source?.boundingBox,
        anchorHints: lineAnchorHints(line),
        tone,
      });
    }
  }

  return queue;
}

export function nextReviewSelection(
  queue: QueueItem[],
  current: ReviewSelection,
): QueueItem | null {
  if (!current) return queue[0] ?? null;
  const idx = queue.findIndex((item) => sameTarget(item, current));
  if (idx < 0) return queue[0] ?? null;
  return queue[idx + 1] ?? null;
}
