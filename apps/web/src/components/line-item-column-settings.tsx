'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type {
  FieldMode,
  LineItemCatalog,
  LineItemColumnConfig,
  LineItemDocumentConfig,
  LineItemFeature,
} from '@/lib/types';

const MODES: { value: FieldMode; label: string }[] = [
  { value: 'IGNORED', label: 'Ignored' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'REQUIRED', label: 'Required' },
];

const CREATE_FEATURE = '__create__';

function slugifyFeatureLabel(label: string): string {
  const parts = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  return parts
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

function featureLabel(
  key: string,
  catalog: LineItemCatalog,
): string {
  return catalog.features.find((f) => f.key === key)?.label ?? key;
}

export type LineItemConfigSavePayload = {
  lineItemConfig: LineItemDocumentConfig;
  customFeature?: { key: string; label: string };
};

interface LineItemColumnSettingsProps {
  config: LineItemDocumentConfig | undefined;
  catalog: LineItemCatalog;
  canManage: boolean;
  saving?: boolean;
  onSave: (payload: LineItemConfigSavePayload) => void;
}

export function LineItemColumnSettings({
  config,
  catalog,
  canManage,
  saving,
  onSave,
}: LineItemColumnSettingsProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [addColumn, setAddColumn] = useState('');
  const [addFeature, setAddFeature] = useState<string>('');
  const [newFeatureLabel, setNewFeatureLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const columns = useMemo(() => {
    return catalog.columns.map((col) => {
      const stored = config?.columns?.[col.key];
      return {
        key: col.key,
        label: col.label,
        mode: (stored?.mode ?? 'OPTIONAL') as FieldMode,
        features: (stored?.features ?? []) as LineItemFeature[],
      };
    });
  }, [catalog.columns, config]);

  const creatingFeature = addFeature === CREATE_FEATURE;
  const selectedFeatureMeta = catalog.features.find((f) => f.key === addFeature);

  const columnsEligibleForFeature = useMemo(() => {
    if (creatingFeature) return catalog.columns;
    if (!addFeature) return catalog.columns;
    const feat = catalog.features.find((f) => f.key === addFeature);
    if (!feat) return catalog.columns;
    // Built-in features may restrict columns; custom features list all.
    if (feat.builtin === false || feat.columnKeys.length === catalog.columns.length) {
      return catalog.columns;
    }
    return catalog.columns.filter((c) => feat.columnKeys.includes(c.key));
  }, [addFeature, catalog, creatingFeature]);

  const ensureAllColumns = (
    next: LineItemDocumentConfig,
  ): LineItemDocumentConfig => {
    const columnsMap = { ...(next.columns ?? {}) };
    for (const col of catalog.columns) {
      if (!columnsMap[col.key]) {
        columnsMap[col.key] = config?.columns?.[col.key] ?? {
          mode: 'OPTIONAL',
          features: [],
        };
      }
    }
    return { columns: columnsMap };
  };

  const patchColumn = (
    columnKey: string,
    patch: Partial<LineItemColumnConfig>,
  ) => {
    const current = config?.columns?.[columnKey] ?? {
      mode: 'OPTIONAL' as FieldMode,
      features: [] as LineItemFeature[],
    };
    const next = ensureAllColumns({
      columns: {
        ...(config?.columns ?? {}),
        [columnKey]: {
          mode: patch.mode ?? current.mode,
          features: patch.features ?? current.features,
        },
      },
    });
    onSave({ lineItemConfig: next });
  };

  const removeFeature = (columnKey: string, feature: LineItemFeature) => {
    if (feature === 'normalizeVolumeToLiters') {
      const next = ensureAllColumns({ columns: { ...(config?.columns ?? {}) } });
      for (const key of ['baseMeasurementUnit', 'baseContentQuantity']) {
        const row = next.columns[key] ?? {
          mode: 'OPTIONAL' as FieldMode,
          features: [] as LineItemFeature[],
        };
        next.columns[key] = {
          mode: row.mode,
          features: (row.features ?? []).filter(
            (f) => f !== 'normalizeVolumeToLiters',
          ),
        };
      }
      onSave({ lineItemConfig: next });
      return;
    }
    const current = config?.columns?.[columnKey];
    const features = (current?.features ?? []).filter((f) => f !== feature);
    patchColumn(columnKey, { features });
  };

  const resetDialog = () => {
    setAddOpen(false);
    setAddColumn('');
    setAddFeature('');
    setNewFeatureLabel('');
    setFormError(null);
  };

  const addConfiguration = () => {
    setFormError(null);

    let featureKey = addFeature;
    let customFeature: { key: string; label: string } | undefined;

    if (creatingFeature) {
      const label = newFeatureLabel.trim();
      if (label.length < 2) {
        setFormError('Enter a feature name (at least 2 characters).');
        return;
      }
      const key = slugifyFeatureLabel(label);
      if (!key || !/^[a-z][a-zA-Z0-9]*$/.test(key)) {
        setFormError(
          'Could not build a valid feature key from that name. Use letters and numbers.',
        );
        return;
      }
      if (catalog.features.some((f) => f.key === key)) {
        setFormError('A feature with this key already exists. Choose another name.');
        return;
      }
      featureKey = key;
      customFeature = { key, label };
    }

    if (!featureKey || featureKey === CREATE_FEATURE) {
      setFormError('Select or create a feature.');
      return;
    }
    if (!addColumn) {
      setFormError('Select a column.');
      return;
    }

    const feat = catalog.features.find((f) => f.key === featureKey);
    const next = ensureAllColumns({
      columns: { ...(config?.columns ?? {}) },
    });

    const targets =
      featureKey === 'normalizeVolumeToLiters'
        ? feat?.columnKeys ?? [addColumn]
        : [addColumn];

    for (const key of targets) {
      const row = next.columns[key] ?? {
        mode: 'OPTIONAL' as FieldMode,
        features: [] as LineItemFeature[],
      };
      const features = new Set(row.features ?? []);
      features.add(featureKey);
      next.columns[key] = {
        mode: row.mode,
        features: [...features],
      };
    }

    onSave({ lineItemConfig: next, customFeature });
    resetDialog();
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Line item columns
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Set visibility and attach column features for this document type.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Saving
              </span>
            ) : null}
            {canManage ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add configuration
              </Button>
            ) : null}
          </div>
        </div>

        <ul className="divide-y">
          {columns.map((col) => (
            <li
              key={col.key}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {col.label}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {col.key}
                </p>
                {col.features.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {col.features.map((f) => (
                      <span
                        key={f}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
                      >
                        {featureLabel(f, catalog)}
                        {canManage ? (
                          <button
                            type="button"
                            className="rounded p-0.5 hover:bg-emerald-100"
                            aria-label={`Remove ${f}`}
                            onClick={() => removeFeature(col.key, f)}
                          >
                            <X className="h-3 w-3" aria-hidden />
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="inline-flex rounded-lg bg-muted p-0.5 ring-1 ring-border">
                {MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    disabled={!canManage || Boolean(saving)}
                    onClick={() => patchColumn(col.key, { mode: mode.value })}
                    className={cn(
                      'rounded-md px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60',
                      col.mode === mode.value
                        ? mode.value === 'REQUIRED'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : mode.value === 'IGNORED'
                            ? 'bg-slate-700 text-white shadow-sm'
                            : 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-card',
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-line-config-title"
          onClick={resetDialog}
        >
          <div
            className="w-full max-w-md rounded-xl border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="add-line-config-title"
              className="text-base font-semibold text-foreground"
            >
              Add column configuration
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Attach a built-in or custom feature to a line column for this
              document type.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  Feature
                </span>
                <select
                  className="input-field"
                  value={addFeature}
                  onChange={(e) => {
                    setAddFeature(e.target.value);
                    setAddColumn('');
                    setFormError(null);
                  }}
                >
                  <option value="">Select feature…</option>
                  {catalog.features.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                      {f.builtin ? '' : ' (custom)'}
                    </option>
                  ))}
                  <option value={CREATE_FEATURE}>+ Create new feature…</option>
                </select>
              </label>

              {creatingFeature ? (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    New feature name
                  </span>
                  <Input
                    value={newFeatureLabel}
                    onChange={(e) => {
                      setNewFeatureLabel(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="e.g. Round price to 2 decimals"
                  />
                  {newFeatureLabel.trim().length >= 2 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Key:{' '}
                      <span className="font-mono">
                        {slugifyFeatureLabel(newFeatureLabel) || '—'}
                      </span>
                    </p>
                  ) : null}
                </label>
              ) : null}

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  Column
                </span>
                <select
                  className="input-field"
                  value={addColumn}
                  disabled={!addFeature}
                  onChange={(e) => {
                    setAddColumn(e.target.value);
                    setFormError(null);
                  }}
                >
                  <option value="">Select column…</option>
                  {columnsEligibleForFeature.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              {addFeature === 'normalizeVolumeToLiters' ? (
                <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Only <strong className="font-medium text-foreground">Base unit</strong>{' '}
                  and{' '}
                  <strong className="font-medium text-foreground">
                    Content / ST
                  </strong>{' '}
                  appear here because this built-in feature converts volume
                  (ML/CL/DL → L). Create a custom feature to attach to any
                  column.
                </p>
              ) : creatingFeature ||
                (selectedFeatureMeta && selectedFeatureMeta.builtin === false) ? (
                <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Custom features can be attached to any line column. Runtime
                  behavior for custom features can be wired later.
                </p>
              ) : null}

              {formError ? (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetDialog}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={Boolean(saving)}
                onClick={addConfiguration}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
