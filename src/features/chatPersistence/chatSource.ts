const SCOPED_ID_PREFIX = 'zsrc:';

export type ChatSourceKind = 'default' | 'paired';

export type ChatSource = {
  kind: ChatSourceKind;
  key: string;
  sourceId: string;
  displayName: string;
};

export function createChatSource(
  kind: ChatSourceKind,
  sourceId: string,
  displayName: string
): ChatSource {
  return {
    kind,
    key: `${kind}:${sourceId}`,
    sourceId,
    displayName
  };
}

export function encodeChatSourceId(source: ChatSource, remoteId: string): string {
  const normalizedId = String(remoteId || '').trim();
  if (!normalizedId || parseChatSourceId(normalizedId)) {
    return normalizedId;
  }
  return `${SCOPED_ID_PREFIX}${encodeURIComponent(source.key)}:${encodeURIComponent(normalizedId)}`;
}

export function parseChatSourceId(
  value: string | null | undefined
): { source: ChatSource; remoteId: string } | null {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith(SCOPED_ID_PREFIX)) {
    return null;
  }
  const separatorIndex = normalized.indexOf(':', SCOPED_ID_PREFIX.length);
  if (separatorIndex < 0) {
    return null;
  }

  try {
    const sourceKey = decodeURIComponent(
      normalized.slice(SCOPED_ID_PREFIX.length, separatorIndex)
    );
    const remoteId = decodeURIComponent(normalized.slice(separatorIndex + 1));
    const kindSeparator = sourceKey.indexOf(':');
    const kind = sourceKey.slice(0, kindSeparator);
    const sourceId = sourceKey.slice(kindSeparator + 1);
    if ((kind !== 'default' && kind !== 'paired') || !sourceId || !remoteId) {
      return null;
    }
    return {
      source: createChatSource(
        kind,
        sourceId,
        kind === 'default' ? '默认服务' : '已配对设备'
      ),
      remoteId
    };
  } catch {
    return null;
  }
}

export function getChatSourceFromId(value: string | null | undefined): ChatSource {
  return (
    parseChatSourceId(value)?.source ??
    createChatSource('paired', 'legacy', '已配对设备')
  );
}

export function getRemoteChatSourceId(value: string | null | undefined): string {
  return parseChatSourceId(value)?.remoteId ?? String(value || '').trim();
}

export function getChatSourceStoragePrefix(source: ChatSource): string {
  return `${SCOPED_ID_PREFIX}${encodeURIComponent(source.key)}:`;
}
