import { normalizeProtocolTimestampMs, toText } from '../../core/api/services/chatEventProtocol.ts';
import type {
  ChatTimelineErrorDetail,
  ChatTimelineSource,
  ChatTimelineSourceChunk,
  ChatTimelineSourceNode
} from './types.ts';
import {
  formatChatTimelinePlatformErrorForDisplay,
  getChatTimelineErrorDetailSignature
} from './timelinePlatformError.ts';

export type NormalizedChatTimelineSourceEvent = {
  stableId: string;
  publishId: string;
  sourceKind: string;
  query: string;
  sourceCount: number;
  chunkCount: number;
  sources: ChatTimelineSource[];
  errorDetail: ChatTimelineErrorDetail | null;
  malformed: boolean;
};

type NormalizedSourceResult = {
  source: ChatTimelineSource | null;
  malformed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return value !== null && value !== '' && Number.isFinite(numeric) ? numeric : undefined;
}

function readPositiveInteger(value: unknown): number | undefined {
  const numeric = readNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  const integer = Math.trunc(numeric);
  return integer > 0 ? integer : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  const numeric = readNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  const integer = Math.trunc(numeric);
  return integer >= 0 ? integer : undefined;
}

function readOptionalTimestamp(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const timestamp = normalizeProtocolTimestampMs(value, 0);
  return timestamp > 0 ? timestamp : undefined;
}

function basename(value: string): string {
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || value;
}

function normalizeSourceChunk(
  value: unknown,
  fallbackIndex: number,
  sourcePath: string
): ChatTimelineSourceChunk | null {
  if (!isRecord(value)) {
    return null;
  }

  const path = toText(value.path) || sourcePath;
  const heading = toText(value.heading);
  const content = toText(value.content) || heading;
  const chunkId = toText(value.chunkId) || `${path || 'chunk'}_${fallbackIndex}`;
  if (!toText(value.chunkId) && !content && !path) {
    return null;
  }

  const score = readNumber(value.score);
  const timestamp = readOptionalTimestamp(value.timestamp);
  const startLine = readPositiveInteger(value.startLine);
  const endLine = readPositiveInteger(value.endLine);
  const pageStart = readPositiveInteger(value.pageStart);
  const pageEnd = readPositiveInteger(value.pageEnd);
  const slideStart = readPositiveInteger(value.slideStart);
  const slideEnd = readPositiveInteger(value.slideEnd);

  return {
    chunkId,
    index: readPositiveInteger(value.index) ?? fallbackIndex,
    content,
    ...(score !== undefined ? { score } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
    ...(path ? { path } : {}),
    ...(heading ? { heading } : {}),
    ...(startLine !== undefined ? { startLine } : {}),
    ...(endLine !== undefined ? { endLine } : {}),
    ...(pageStart !== undefined ? { pageStart } : {}),
    ...(pageEnd !== undefined ? { pageEnd } : {}),
    ...(slideStart !== undefined ? { slideStart } : {}),
    ...(slideEnd !== undefined ? { slideEnd } : {}),
    ...(toText(value.sourceType) ? { sourceType: toText(value.sourceType) } : {}),
    ...(toText(value.matchType) ? { matchType: toText(value.matchType) } : {})
  };
}

function normalizeChunkIndexes(value: unknown, chunks: readonly ChatTimelineSourceChunk[]): number[] {
  const explicit = Array.isArray(value)
    ? value.map(readPositiveInteger).filter((index): index is number => index !== undefined)
    : [];
  const indexes = explicit.length > 0 ? explicit : chunks.map((chunk) => chunk.index);
  return [...new Set(indexes.filter((index) => index > 0))];
}

function normalizeSource(value: unknown, fallbackIndex: number): NormalizedSourceResult {
  if (!isRecord(value)) {
    return { source: null, malformed: true };
  }

  const rawChunks = Array.isArray(value.chunks) ? value.chunks : [];
  const sourcePath = toText(value.title) || toText(value.name) || toText(value.id);
  let malformed = value.chunks !== undefined && !Array.isArray(value.chunks);
  const chunks: ChatTimelineSourceChunk[] = [];
  rawChunks.forEach((chunk, index) => {
    const normalized = normalizeSourceChunk(chunk, index + 1, sourcePath);
    if (normalized) {
      chunks.push(normalized);
    } else {
      malformed = true;
    }
  });

  const firstPath = chunks.find((chunk) => chunk.path)?.path || '';
  const title = toText(value.title) || firstPath;
  const name = toText(value.name) || basename(title || firstPath || toText(value.id));
  const url = toText(value.url);
  const link = toText(value.link);
  const id = toText(value.id) || title || name || url || link;
  const collectionId = toText(value.collectionId);
  const collectionName = toText(value.collectionName);
  const icon = toText(value.icon);
  if (!id && !icon && !collectionId && !collectionName && chunks.length === 0) {
    return { source: null, malformed: true };
  }

  const chunkIndexes = normalizeChunkIndexes(value.chunkIndexes, chunks);
  const minIndex = readNonNegativeInteger(value.minIndex) ?? (chunkIndexes.length > 0 ? Math.min(...chunkIndexes) : 0);
  return {
    malformed,
    source: {
      id: id || `source_${fallbackIndex}`,
      name: name || basename(id) || `source_${fallbackIndex}`,
      ...(title ? { title } : {}),
      ...(icon ? { icon } : {}),
      ...(url ? { url } : {}),
      ...(link ? { link } : {}),
      ...(collectionId ? { collectionId } : {}),
      ...(collectionName ? { collectionName } : {}),
      chunkIndexes,
      minIndex,
      chunks
    }
  };
}

function normalizeSourceError(event: Record<string, unknown>): ChatTimelineErrorDetail | null {
  const status = toText(event.status).toLowerCase();
  const errorInput = event.errorDetail ?? event.error ?? event.failure;
  if (errorInput === null || errorInput === undefined || errorInput === '') {
    if (status !== 'error' && status !== 'failed') {
      return null;
    }
    return formatChatTimelinePlatformErrorForDisplay({
      code: status,
      message: toText(event.message)
    }).error;
  }
  return formatChatTimelinePlatformErrorForDisplay(errorInput).error;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sourcePayloadIdentity(query: string, sourceKind: string, sources: readonly ChatTimelineSource[]): string {
  return hashText(
    JSON.stringify([
      query,
      sourceKind,
      sources.map((source) => [
        source.id,
        source.url,
        source.link,
        source.chunks.map((chunk) => [chunk.chunkId, chunk.index, chunk.path, chunk.content])
      ])
    ])
  );
}

function readEventIdentity(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function normalizeChatTimelineSourceEvent(event: Record<string, unknown>): NormalizedChatTimelineSourceEvent {
  const sources: ChatTimelineSource[] = [];
  const rawSources = Array.isArray(event.sources) ? event.sources : [];
  let malformed = event.sources !== undefined && !Array.isArray(event.sources);
  rawSources.forEach((source, index) => {
    const normalized = normalizeSource(source, index + 1);
    malformed = malformed || normalized.malformed;
    if (normalized.source) {
      sources.push(normalized.source);
    }
  });

  const publishId = toText(event.publishId);
  const sourceKind = toText(event.kind);
  const query = toText(event.query);
  const declaredSourceCount = readNonNegativeInteger(event.sourceCount);
  const sourceCount = declaredSourceCount ?? sources.length;
  const chunkCount =
    readNonNegativeInteger(event.chunkCount) ?? sources.reduce((total, source) => total + source.chunks.length, 0);
  malformed = malformed || (sourceCount > 0 && sources.length === 0);
  const explicitIdentity =
    publishId ||
    readEventIdentity(event.id) ||
    readEventIdentity(event.seq) ||
    readEventIdentity(event.timestamp ?? event.ts ?? event.createdAt ?? event.updatedAt) ||
    readEventIdentity(event.requestId) ||
    readEventIdentity(event.toolId);

  return {
    stableId: explicitIdentity || `payload_${sourcePayloadIdentity(query, sourceKind, sources)}`,
    publishId,
    sourceKind,
    query,
    sourceCount,
    chunkCount,
    sources,
    errorDetail: normalizeSourceError(event),
    malformed
  };
}

function optionalNumberEquals(left: number | undefined, right: number | undefined): boolean {
  return left === right;
}

function sourceChunkEquals(left: ChatTimelineSourceChunk, right: ChatTimelineSourceChunk): boolean {
  return (
    left.chunkId === right.chunkId &&
    left.index === right.index &&
    left.content === right.content &&
    optionalNumberEquals(left.score, right.score) &&
    optionalNumberEquals(left.timestamp, right.timestamp) &&
    left.path === right.path &&
    left.heading === right.heading &&
    optionalNumberEquals(left.startLine, right.startLine) &&
    optionalNumberEquals(left.endLine, right.endLine) &&
    optionalNumberEquals(left.pageStart, right.pageStart) &&
    optionalNumberEquals(left.pageEnd, right.pageEnd) &&
    optionalNumberEquals(left.slideStart, right.slideStart) &&
    optionalNumberEquals(left.slideEnd, right.slideEnd) &&
    left.sourceType === right.sourceType &&
    left.matchType === right.matchType
  );
}

function numberArrayEquals(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sourceEquals(left: ChatTimelineSource, right: ChatTimelineSource): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.title === right.title &&
    left.icon === right.icon &&
    left.url === right.url &&
    left.link === right.link &&
    left.collectionId === right.collectionId &&
    left.collectionName === right.collectionName &&
    left.minIndex === right.minIndex &&
    numberArrayEquals(left.chunkIndexes, right.chunkIndexes) &&
    left.chunks.length === right.chunks.length &&
    left.chunks.every((chunk, index) => sourceChunkEquals(chunk, right.chunks[index]))
  );
}

export function chatTimelineSourceNodePayloadEquals(
  left: ChatTimelineSourceNode,
  right: ChatTimelineSourceNode
): boolean {
  return (
    left.publishId === right.publishId &&
    left.sourceKind === right.sourceKind &&
    left.query === right.query &&
    left.sourceCount === right.sourceCount &&
    left.chunkCount === right.chunkCount &&
    left.malformed === right.malformed &&
    getChatTimelineErrorDetailSignature(left.errorDetail) === getChatTimelineErrorDetailSignature(right.errorDetail) &&
    left.sources.length === right.sources.length &&
    left.sources.every((source, index) => sourceEquals(source, right.sources[index]))
  );
}

export function getChatTimelineSourceContentLength(node: ChatTimelineSourceNode): number {
  return (
    node.query.length +
    node.sourceKind.length +
    getChatTimelineErrorDetailSignature(node.errorDetail).length +
    node.sources.reduce(
      (sourceTotal, source) =>
        sourceTotal +
        source.id.length +
        source.name.length +
        (source.title?.length ?? 0) +
        (source.url?.length ?? 0) +
        (source.link?.length ?? 0) +
        (source.collectionName?.length ?? 0) +
        source.chunks.reduce(
          (chunkTotal, chunk) =>
            chunkTotal +
            chunk.chunkId.length +
            chunk.content.length +
            (chunk.path?.length ?? 0) +
            (chunk.heading?.length ?? 0),
          0
        ),
      0
    )
  );
}
