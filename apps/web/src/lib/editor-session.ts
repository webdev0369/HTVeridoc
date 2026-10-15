import type { AuthUser, RoleCode } from './types';

const EMBED_FLAG = 'htveridoc.embed';
const EMBED_DOC = 'htveridoc.embedDocumentId';

export interface EditorLinkPayload {
  sub?: string;
  email?: string;
  name?: string;
  organizationId?: string;
  role?: RoleCode;
  permissions?: string[];
  typ?: string;
  documentId?: string;
  exp?: number;
}

function b64UrlJson(part: string): unknown {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  return JSON.parse(atob(padded));
}

/** Decode a handoff editor JWT without verifying (API verifies on each call). */
export function parseEditorLinkToken(token: string): EditorLinkPayload | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const json = b64UrlJson(payloadPart) as EditorLinkPayload;
    if (json.typ && json.typ !== 'editor_link') return null;
    if (!json.documentId || !json.organizationId || !json.sub) return null;
    if (json.exp && json.exp * 1000 < Date.now()) return null;
    return json;
  } catch {
    return null;
  }
}

export function isEditorLinkToken(token: string | null | undefined): boolean {
  if (!token) return false;
  return parseEditorLinkToken(token) != null;
}

export function authUserFromEditorToken(token: string): AuthUser | null {
  const json = parseEditorLinkToken(token);
  if (!json?.sub || !json.organizationId) return null;
  return {
    userId: json.sub,
    email: json.email ?? 'editor-link@handoff.local',
    name: json.name ?? 'Editor link',
    organizationId: json.organizationId,
    role: json.role ?? 'REVIEWER',
    permissions: json.permissions ?? [],
  };
}

export function markEmbedSession(documentId: string) {
  try {
    sessionStorage.setItem(EMBED_FLAG, '1');
    sessionStorage.setItem(EMBED_DOC, documentId);
  } catch {
    /* private mode */
  }
}

export function clearEmbedSession() {
  try {
    sessionStorage.removeItem(EMBED_FLAG);
    sessionStorage.removeItem(EMBED_DOC);
  } catch {
    /* ignore */
  }
}

export function isEmbedSession(documentId?: string): boolean {
  try {
    if (sessionStorage.getItem(EMBED_FLAG) !== '1') return false;
    if (!documentId) return true;
    return sessionStorage.getItem(EMBED_DOC) === documentId;
  } catch {
    return false;
  }
}
