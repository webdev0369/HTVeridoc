'use client';

import type { ExtractionDto } from '@/lib/types';

function confidenceClass(confidence: number | null) {
  if (confidence == null) return 'text-slate-400';
  if (confidence >= 0.95) return 'text-emerald-600';
  if (confidence >= 0.8) return 'text-amber-600';
  return 'text-rose-600';
}

function lineTypeClass(lineType: string) {
  switch (lineType) {
    case 'CANCELLED':
      return 'bg-rose-100 text-rose-800';
    case 'FEE':
      return 'bg-amber-100 text-amber-800';
    case 'NOTE':
      return 'bg-slate-100 text-slate-700';
    case 'PRODUCT':
      return 'bg-emerald-100 text-emerald-800';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export function ExtractionPanel({ extraction }: { extraction: ExtractionDto }) {
  const fields = extraction.fields ?? [];
  const lineItems = extraction.lineItems ?? [];
  const summary = extraction.summary;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-mist bg-white px-4 py-3 text-sm text-slate-600">
        <div>Model: {extraction.model}</div>
        <div>Prompt: v{extraction.promptVersion}</div>
        <div>Schema: v{extraction.schemaVersion}</div>
        {extraction.processingTimeMs != null && (
          <div>Time: {extraction.processingTimeMs} ms</div>
        )}
        {summary && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">
              {summary.lineItemCount} lines
            </span>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
              {summary.cancelledLineCount} cancelled
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
              {summary.feeLineCount} fees
            </span>
          </div>
        )}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Document information
        </h3>
        <div className="overflow-hidden rounded-lg border border-mist bg-white">
          <table className="w-full text-sm">
            <tbody>
              {fields.map((field) => (
                <tr key={field.id} className="border-b border-mist/70 last:border-0">
                  <td className="w-[40%] px-3 py-2 text-slate-500">
                    {field.fieldLabel}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {field.currentValue ?? (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="w-16 px-3 py-2 text-right text-xs">
                    <span className={confidenceClass(field.confidence)}>
                      {field.confidence != null
                        ? `${Math.round(field.confidence * 100)}%`
                        : ''}
                    </span>
                  </td>
                  <td className="w-14 px-3 py-2 text-right text-xs text-slate-400">
                    {field.source?.page ? `p.${field.source.page}` : ''}
                  </td>
                </tr>
              ))}
              {!fields.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-slate-400">
                    No structured fields yet. Reprocess to populate Phase 5 rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Line items
        </h3>
        <div className="overflow-auto rounded-lg border border-mist bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-mist bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Article</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Qty</th>
                <th className="px-2 py-2">Purchase unit</th>
                <th className="px-2 py-2">Stock unit</th>
                <th className="px-2 py-2">Qty/PU</th>
                <th className="px-2 py-2">Base unit</th>
                <th className="px-2 py-2">Content / ST</th>
                <th className="px-2 py-2">Price</th>
                <th className="px-2 py-2">Disc.</th>
                <th className="px-2 py-2">VAT %</th>
                <th className="px-2 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line) => (
                <tr
                  key={line.id}
                  className={`border-b border-mist/70 last:border-0 ${
                    line.lineType === 'CANCELLED' ? 'bg-rose-50/40' : ''
                  }`}
                >
                  <td className="px-2 py-2">{line.position ?? '—'}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${lineTypeClass(
                        line.lineType,
                      )}`}
                    >
                      {line.lineType}
                    </span>
                  </td>
                  <td className="px-2 py-2">{line.articleNumber ?? '—'}</td>
                  <td className="max-w-[180px] truncate px-2 py-2" title={line.description ?? ''}>
                    {line.description ?? '—'}
                  </td>
                  <td className="px-2 py-2">{line.quantity ?? '—'}</td>
                  <td className="px-2 py-2">
                    {line.purchaseUnit ?? line.unit ?? '—'}
                  </td>
                  <td className="px-2 py-2">{line.stocktakingUnit ?? '—'}</td>
                  <td className="px-2 py-2">
                    {line.stockTakingQuantityPerPurchaseUnit ?? '—'}
                  </td>
                  <td className="px-2 py-2">{line.baseMeasurementUnit ?? '—'}</td>
                  <td className="px-2 py-2">{line.baseContentQuantity ?? '—'}</td>
                  <td className="px-2 py-2">{line.unitPrice ?? '—'}</td>
                  <td className="px-2 py-2">{line.discount ?? '—'}</td>
                  <td className="px-2 py-2">{line.vat ?? '—'}</td>
                  <td className="px-2 py-2">{line.amount ?? '—'}</td>
                </tr>
              ))}
              {!lineItems.length && (
                <tr>
                  <td colSpan={14} className="px-3 py-4 text-slate-400">
                    No line items extracted.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <details className="rounded-lg border border-mist bg-white">
        <summary className="cursor-pointer px-4 py-2 text-sm text-slate-500">
          Raw structured JSON
        </summary>
        <pre className="max-h-64 overflow-auto border-t border-mist bg-slate-950 p-4 text-xs text-slate-100">
          {JSON.stringify(extraction.structuredData, null, 2)}
        </pre>
      </details>
    </div>
  );
}
