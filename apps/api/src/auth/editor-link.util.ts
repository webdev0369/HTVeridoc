/** Handoff editor JWTs use `sub: editor:<documentId>` (not a real users.id). */
export function isEditorLinkUserId(userId: string | null | undefined): boolean {
  return Boolean(userId?.startsWith('editor:'));
}

/** Resolve the document UUID scoped by an editor-link token. */
export function resolveEditorDocumentId(
  userId: string,
  documentIdFromToken?: string | null,
): string | null {
  if (documentIdFromToken?.trim()) return documentIdFromToken.trim();
  if (!isEditorLinkUserId(userId)) return null;
  const id = userId.slice('editor:'.length).trim();
  return id || null;
}
