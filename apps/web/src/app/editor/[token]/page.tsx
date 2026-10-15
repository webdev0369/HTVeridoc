'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/**
 * Handoff editor entry: partner systems open /editor/<jwt> in an iframe.
 * Hydrates a scoped session and opens the document review UI in embed mode
 * (no SaaS login, dashboard, or top navigation).
 */
export default function EditorLinkPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { acceptEditorSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = params?.token;
    if (!raw) {
      setError('Missing editor token');
      return;
    }

    let token = raw;
    try {
      token = decodeURIComponent(raw);
    } catch {
      /* use raw */
    }

    try {
      const documentId = acceptEditorSession(token);
      router.replace(`/documents/${documentId}?embed=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid editor link');
    }
  }, [params?.token, router, acceptEditorSession]);

  if (error) {
    const expired =
      /expired|invalid/i.test(error) || error.includes('editor link');
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0b0f14] px-6 text-center">
        <p className="text-lg font-semibold text-slate-100">
          {expired ? 'Session expired' : 'Cannot open editor'}
        </p>
        <p className="max-w-md text-sm text-slate-400">
          {expired
            ? 'Close and reopen review from the host app. Your partner application should fetch a fresh editor link before the previous one expires.'
            : error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 text-slate-200">
      <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
      <p className="text-sm text-slate-400">Opening review editor…</p>
    </div>
  );
}
