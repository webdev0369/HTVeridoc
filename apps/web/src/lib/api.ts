import { isEditorLinkToken } from './editor-session';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getStoredTokens() {
  if (typeof window === 'undefined') return null;
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  if (!accessToken) return null;
  return { accessToken, refreshToken };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const tokens = getStoredTokens();
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  // Editor-link JWTs are not refresh tokens — do not wipe the embed session.
  if (
    res.status === 401 &&
    retry &&
    tokens?.refreshToken &&
    !isEditorLinkToken(tokens.accessToken)
  ) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (refreshed.ok) {
      const data = (await refreshed.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      setTokens(data.accessToken, data.refreshToken);
      return apiFetch<T>(path, options, false);
    }
    clearTokens();
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export function getApiUrl() {
  return API_URL;
}

export async function fetchDocumentPdfBlob(documentId: string): Promise<Blob> {
  const tokens = getStoredTokens();
  const res = await fetch(`${API_URL}/documents/${documentId}/file`, {
    headers: tokens?.accessToken
      ? { Authorization: `Bearer ${tokens.accessToken}` }
      : {},
  });
  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to load PDF');
  }
  return res.blob();
}
