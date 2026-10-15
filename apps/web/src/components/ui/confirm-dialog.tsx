'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type ConfirmTone = 'default' | 'danger' | 'warning';

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual tone for the confirm action / icon */
  tone?: ConfirmTone;
  /** Hide the cancel button (rare) */
  hideCancel?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

type InternalState = ConfirmOptions & {
  open: boolean;
};

const ConfirmContext = createContext<ConfirmFn | null>(null);

const toneStyles: Record<
  ConfirmTone,
  { iconWrap: string; confirmVariant: 'default' | 'destructive' }
> = {
  default: {
    iconWrap: 'bg-primary/10 text-primary',
    confirmVariant: 'default',
  },
  warning: {
    iconWrap: 'bg-amber-100 text-amber-800',
    confirmVariant: 'default',
  },
  danger: {
    iconWrap: 'bg-destructive/10 text-destructive',
    confirmVariant: 'destructive',
  },
};

function ToneIcon({ tone }: { tone: ConfirmTone }) {
  if (tone === 'default') return <Info className="h-5 w-5" />;
  return <AlertTriangle className="h-5 w-5" />;
}

/**
 * App-wide confirm modal. Use via `useConfirm()`:
 *
 * ```ts
 * const confirm = useConfirm();
 * const ok = await confirm({ title: '...', description: '...', tone: 'warning' });
 * if (!ok) return;
 * ```
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [state, setState] = useState<InternalState>({
    open: false,
    title: '',
  });

  const close = useCallback((result: boolean) => {
    setState((prev) => ({ ...prev, open: false }));
    resolverRef.current?.(result);
    resolverRef.current = null;
  }, []);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        title: options.title,
        description: options.description,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        tone: options.tone ?? 'default',
        hideCancel: options.hideCancel ?? false,
      });
    });
  }, []);

  const tone = toneStyles[state.tone ?? 'default'];

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={state.open}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
      >
        <DialogContent showClose={false} className="max-w-md gap-5">
          <DialogHeader className="space-y-3">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  tone.iconWrap,
                )}
              >
                <ToneIcon tone={state.tone ?? 'default'} />
              </div>
              <div className="space-y-1.5 pt-0.5">
                <DialogTitle>{state.title}</DialogTitle>
                {state.description ? (
                  typeof state.description === 'string' ? (
                    <DialogDescription>{state.description}</DialogDescription>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {state.description}
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            {!state.hideCancel ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => close(false)}
              >
                {state.cancelLabel}
              </Button>
            ) : null}
            <Button
              type="button"
              variant={tone.confirmVariant}
              onClick={() => close(true)}
            >
              {state.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}

/** Controlled confirm dialog when you prefer local state over useConfirm(). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  hideCancel = false,
  onConfirm,
  loading = false,
}: ConfirmOptions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  const styles = toneStyles[tone];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="max-w-md gap-5">
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                styles.iconWrap,
              )}
            >
              <ToneIcon tone={tone} />
            </div>
            <div className="space-y-1.5 pt-0.5">
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                typeof description === 'string' ? (
                  <DialogDescription>{description}</DialogDescription>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {description}
                  </div>
                )
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          {!hideCancel ? (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={styles.confirmVariant}
            disabled={loading}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
