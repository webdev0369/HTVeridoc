export const SERVICE_NAMES = [
  'all',
  'identity',
  'documents',
  'processing',
  'review',
  'integrations',
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

/** Which Nest domain slice this process should load. Default `all` = monolith. */
export function resolveServiceName(): ServiceName {
  const raw = (process.env.SERVICE_NAME || 'all').trim().toLowerCase();
  if ((SERVICE_NAMES as readonly string[]).includes(raw)) {
    return raw as ServiceName;
  }
  return 'all';
}
