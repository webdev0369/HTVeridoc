import type { DocumentStatus } from '@/lib/types';

const light: Record<string, string> = {
  UPLOADED: 'bg-sky-100 text-sky-800',
  PROCESSING: 'bg-amber-100 text-amber-800',
  EXTRACTED: 'bg-sky-100 text-sky-800',
  VALIDATING: 'bg-amber-100 text-amber-800',
  READY_FOR_REVIEW: 'bg-violet-100 text-violet-800',
  IN_REVIEW: 'bg-indigo-100 text-indigo-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  EXPORTING: 'bg-teal-100 text-teal-800',
  EXPORTED: 'bg-teal-100 text-teal-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  PROCESSING_FAILED: 'bg-rose-100 text-rose-800',
  EXTRACTION_FAILED: 'bg-rose-100 text-rose-800',
  VALIDATION_FAILED: 'bg-rose-100 text-rose-800',
  EXPORT_FAILED: 'bg-rose-100 text-rose-800',
};

const dark: Record<string, string> = {
  UPLOADED: 'bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/30',
  PROCESSING: 'bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/30',
  EXTRACTED: 'bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/30',
  VALIDATING: 'bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-400/30',
  READY_FOR_REVIEW:
    'bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-400/30',
  IN_REVIEW: 'bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-400/30',
  APPROVED: 'bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30',
  EXPORTING: 'bg-teal-500/15 text-teal-200 ring-1 ring-inset ring-teal-400/30',
  EXPORTED: 'bg-teal-500/15 text-teal-200 ring-1 ring-inset ring-teal-400/30',
  REJECTED: 'bg-rose-500/15 text-rose-200 ring-1 ring-inset ring-rose-400/30',
  PROCESSING_FAILED:
    'bg-rose-500/15 text-rose-200 ring-1 ring-inset ring-rose-400/30',
  EXTRACTION_FAILED:
    'bg-rose-500/15 text-rose-200 ring-1 ring-inset ring-rose-400/30',
  VALIDATION_FAILED:
    'bg-rose-500/15 text-rose-200 ring-1 ring-inset ring-rose-400/30',
  EXPORT_FAILED: 'bg-rose-500/15 text-rose-200 ring-1 ring-inset ring-rose-400/30',
};

/** Compact single-line labels for table badges */
const labels: Record<string, string> = {
  UPLOADED: 'Uploaded',
  PROCESSING: 'Processing',
  EXTRACTED: 'Extracted',
  VALIDATING: 'Validating',
  READY_FOR_REVIEW: 'Ready for review',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  EXPORTING: 'Exporting',
  EXPORTED: 'Exported',
  REJECTED: 'Rejected',
  PROCESSING_FAILED: 'Process failed',
  EXTRACTION_FAILED: 'Extract failed',
  VALIDATION_FAILED: 'Validation failed',
  EXPORT_FAILED: 'Export failed',
};

export function StatusBadge({
  status,
  variant = 'light',
}: {
  status: DocumentStatus;
  variant?: 'light' | 'dark';
}) {
  const styles = variant === 'dark' ? dark : light;
  const label = labels[status] ?? status.replaceAll('_', ' ');
  return (
    <span
      title={status.replaceAll('_', ' ')}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${
        styles[status] ||
        (variant === 'dark'
          ? 'bg-white/10 text-slate-300'
          : 'bg-slate-100 text-slate-700')
      }`}
    >
      {label}
    </span>
  );
}
