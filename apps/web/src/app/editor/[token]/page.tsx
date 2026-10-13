'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { setTokens } from '@/lib/api';

/**
 * Handoff editor entry: other systems open /editor/<jwt>.
 * We store the token as the access session and redirect to the document page.
 */
export default function EditorLinkPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
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
      const payloadPart = token.split('.')[1];
      if (!payloadPart) throw new Error('Invalid token');
      const json = JSON.parse(
        atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')),
      ) as { documentId?: string; typ?: string; exp?: number };

      if (json.typ && json.typ !== 'editor_link') {
        throw new Error('Not an editor link token');
      }
      if (json.exp && json.exp * 1000 < Date.now()) {
        throw new Error('Editor link has expired');
      }
      if (!json.documentId) {
        throw new Error('Token missing documentId');
      }

      // Editor JWT is used as Bearer access; refresh unused for handoff sessions.
      setTokens(token, token);
      router.replace(`/documents/${json.documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid editor link');
    }
  }, [params?.token, router]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-950 px-4 text-center text-slate-200">
        <p className="text-lg font-medium">Cannot open editor</p>
        <p className="text-sm text-slate-400">{error}</p>
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
