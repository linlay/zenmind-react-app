export type ChatViewReference = {
  connectorId: string;
  key: string;
  version?: string;
  hash?: string;
  renderer?: 'html' | 'qlc';
};
export type ChatViewRequest = {
  chatId: string;
  connectorId: string;
  key: string;
  hash?: string;
  usage: 'display' | 'form';
};
export type ChatViewDocument = {
  view: ChatViewReference;
  entry?: string;
  html?: string;
  qlc?: Record<string, unknown>;
  assets?: { path: string; mediaType: string; data: string }[];
};
export function readChatViewReference(value: unknown): ChatViewReference | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  const { connectorId, key, hash, version, renderer } = record;
  if (
    typeof connectorId !== 'string' ||
    typeof key !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(connectorId) ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(key) ||
    (hash !== undefined && (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)))
  )
    return;
  return {
    connectorId,
    key,
    ...(hash ? { hash: hash as string } : {}),
    ...(typeof version === 'string' ? { version } : {}),
    ...(renderer === 'html' || renderer === 'qlc' ? { renderer } : {})
  };
}
