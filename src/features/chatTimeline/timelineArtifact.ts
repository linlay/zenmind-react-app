import { normalizeProtocolTimestampMs, toText } from '../../core/api/services/chatEventProtocol.ts';
import {
  getChatAttachmentExtension,
  getChatAttachmentKind,
  normalizeChatAttachmentResourceUrl
} from '../chatPersistence/chatAttachmentModels.ts';
import type { ChatTimelineArtifactNode, ChatTimelineArtifactPreviewKind, ChatTimelineArtifactStatus } from './types.ts';

export type NormalizedChatTimelineArtifact = {
  artifactId: string;
  name: string;
  mimeType: string;
  resourceUrl: string;
  sha256: string;
  sizeBytes: number;
  previewKind: ChatTimelineArtifactPreviewKind;
  status: ChatTimelineArtifactStatus;
  summary: string;
  errorReason: string;
  runId: string;
  timestamp: number;
};

const TEXT_EXTENSIONS = new Set([
  'css',
  'csv',
  'html',
  'htm',
  'ini',
  'js',
  'json',
  'jsx',
  'log',
  'md',
  'mjs',
  'py',
  'sql',
  'toml',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return '';
}

export function resolveChatTimelineArtifactPreviewKind(input: {
  name?: string | null;
  mimeType?: string | null;
}): ChatTimelineArtifactPreviewKind {
  const mimeType = toText(input.mimeType).toLowerCase().split(';', 1)[0];
  const extension = getChatAttachmentExtension(input.name);
  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return 'pdf';
  }
  if (getChatAttachmentKind({ name: input.name, mimeType }) === 'image') {
    return 'image';
  }
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/xml' ||
    mimeType.endsWith('+json') ||
    mimeType.endsWith('+xml') ||
    TEXT_EXTENSIONS.has(extension)
  ) {
    return 'text';
  }
  return 'unsupported';
}

function normalizeArtifactStatus(value: unknown, resourceUrl: string): ChatTimelineArtifactStatus {
  const status = toText(value).toLowerCase();
  if (['error', 'failed', 'failure', 'cancelled', 'canceled'].includes(status)) {
    return 'failed';
  }
  if (['generating', 'pending', 'processing', 'running', 'uploading'].includes(status)) {
    return 'processing';
  }
  if (['complete', 'completed', 'published', 'ready', 'success', 'succeeded'].includes(status)) {
    return 'ready';
  }
  return resourceUrl ? 'ready' : 'processing';
}

function normalizeResourceUrl(value: unknown): string {
  const resourceUrl = normalizeChatAttachmentResourceUrl(value);
  if (
    !resourceUrl ||
    resourceUrl.startsWith('//') ||
    (!resourceUrl.startsWith('/') && !/^https?:\/\//i.test(resourceUrl))
  ) {
    return '';
  }
  return resourceUrl;
}

function eventArtifactItems(event: Record<string, unknown>): Record<string, unknown>[] {
  const payload = isRecord(event.payload) ? event.payload : null;
  const arrays = [event.artifacts, payload?.artifacts, payload?.items];
  for (const value of arrays) {
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }
  if (isRecord(event.artifact)) {
    return [event.artifact];
  }
  return payload ? [{ ...payload, ...event }] : [event];
}

function normalizeArtifactItem(
  item: Record<string, unknown>,
  event: Record<string, unknown>,
  index: number,
  fallbackTimestamp: number
): NormalizedChatTimelineArtifact | null {
  const resourceUrl = normalizeResourceUrl(
    item.resourceUrl ?? item.downloadUrl ?? item.url ?? event.resourceUrl ?? event.downloadUrl ?? event.url
  );
  const sha256 = firstText(item.sha256, event.sha256);
  const artifactId = firstText(
    item.artifactId,
    item.id,
    sha256,
    resourceUrl,
    item.name,
    item.title,
    event.artifactId,
    event.id
  );
  const name = firstText(
    item.name,
    item.fileName,
    item.filename,
    item.title,
    event.name,
    event.fileName,
    event.title,
    artifactId
  );
  const status = normalizeArtifactStatus(item.status ?? item.state ?? event.status ?? event.state, resourceUrl);
  if (!artifactId || !name || (!resourceUrl && status === 'ready')) {
    return null;
  }

  const rawSize = Number(item.sizeBytes ?? item.size ?? event.sizeBytes ?? event.size);
  const mimeType = firstText(item.mimeType, item.contentType, event.mimeType, event.contentType).toLowerCase();
  return {
    artifactId,
    name,
    mimeType: mimeType || 'application/octet-stream',
    resourceUrl,
    sha256,
    sizeBytes: Number.isFinite(rawSize) && rawSize >= 0 ? Math.floor(rawSize) : 0,
    previewKind: resolveChatTimelineArtifactPreviewKind({ name, mimeType }),
    status,
    summary: firstText(item.summary, item.description, event.summary, event.description),
    errorReason:
      status === 'failed'
        ? firstText(item.errorReason, item.error, item.message, event.errorReason, event.error, event.message)
        : '',
    runId: firstText(item.runId, event.runId),
    timestamp: normalizeProtocolTimestampMs(
      item.timestamp ?? item.updatedAt ?? item.createdAt ?? event.timestamp ?? event.updatedAt ?? event.createdAt,
      fallbackTimestamp + index
    )
  };
}

export function normalizeChatTimelineArtifactEvent(
  event: Record<string, unknown>,
  fallbackTimestamp = Date.now()
): NormalizedChatTimelineArtifact[] {
  const byId = new Map<string, NormalizedChatTimelineArtifact>();
  eventArtifactItems(event).forEach((item, index) => {
    const artifact = normalizeArtifactItem(item, event, index, fallbackTimestamp);
    if (!artifact) {
      return;
    }
    const current = byId.get(artifact.artifactId);
    if (!current || artifact.timestamp >= current.timestamp) {
      byId.set(artifact.artifactId, artifact);
    }
  });
  return [...byId.values()];
}

export function chatTimelineArtifactNodePayloadEquals(
  left: ChatTimelineArtifactNode,
  right: ChatTimelineArtifactNode
): boolean {
  return (
    left.artifactId === right.artifactId &&
    left.name === right.name &&
    left.mimeType === right.mimeType &&
    left.resourceUrl === right.resourceUrl &&
    left.sha256 === right.sha256 &&
    left.sizeBytes === right.sizeBytes &&
    left.previewKind === right.previewKind &&
    left.status === right.status &&
    left.summary === right.summary &&
    left.errorReason === right.errorReason &&
    left.runId === right.runId
  );
}

export function getChatTimelineArtifactContentLength(node: ChatTimelineArtifactNode): number {
  return (
    node.name.length +
    node.mimeType.length +
    node.resourceUrl.length +
    node.summary.length +
    node.errorReason.length
  );
}
