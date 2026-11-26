type ChatViewIdentity = {
  key: string;
  renderer?: 'native' | 'html' | 'qlc';
};
export type ChatViewReference = ChatViewIdentity &
  (
    | { source: 'builtin'; connectorId?: never; hash?: never; version?: never }
    | { source: 'connector'; connectorId: string; hash?: string; version?: string }
  );
export type ChatViewRequest = {
  chatId: string;
  key: string;
  usage: 'display' | 'form';
} & (
  | { source: 'builtin'; connectorId?: never; hash?: never }
  | { source: 'connector'; connectorId: string; hash: string }
);

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
  const { source, connectorId, key, hash, version, renderer } = record;
  if (
    (source !== 'builtin' && source !== 'connector') ||
    typeof key !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(key) ||
    (source === 'connector' && (typeof connectorId !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(connectorId))) ||
    (source === 'builtin' && (connectorId !== undefined || hash !== undefined || version !== undefined)) ||
    (hash !== undefined && (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) ||
    (version !== undefined && typeof version !== 'string') ||
    (renderer !== undefined && renderer !== 'native' && renderer !== 'html' && renderer !== 'qlc')
  )
    return;
  return {
    key,
    ...(source === 'builtin'
      ? { source }
      : {
          source,
          connectorId: connectorId as string,
          ...(hash ? { hash: hash as string } : {}),
          ...(typeof version === 'string' ? { version } : {})
        }),
    ...(renderer === 'native' || renderer === 'html' || renderer === 'qlc' ? { renderer } : {})
  };
}
