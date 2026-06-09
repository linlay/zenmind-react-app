import { defaultT, type TFunction } from '../../shared/i18n/translate.ts';
import type {
  ChatAttachmentBase,
  ChatAttachmentKind,
  ChatAttachmentReference,
  ChatAttachmentStatus,
  ChatMessageAttachment
} from './types';

const IMAGE_EXTENSIONS = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp'
]);

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLowerText(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getChatAttachmentExtension(name?: string | null): string {
  const normalizedName = normalizeText(name).split(/[?#]/, 1)[0];
  const lastDotIndex = normalizedName.lastIndexOf('.');
  if (lastDotIndex < 0 || lastDotIndex === normalizedName.length - 1) {
    return '';
  }
  return normalizedName.slice(lastDotIndex + 1).toLowerCase();
}

export function getChatAttachmentKind(input: {
  type?: string | null;
  name?: string | null;
  mimeType?: string | null;
}): ChatAttachmentKind {
  const rawType = normalizeLowerText(input.type);
  if (rawType === 'image') {
    return 'image';
  }

  const mimeType = normalizeLowerText(input.mimeType);
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  return IMAGE_EXTENSIONS.has(getChatAttachmentExtension(input.name)) ? 'image' : 'file';
}

export function formatChatAttachmentSize(sizeBytes?: number | null): string {
  const numericSize = Number(sizeBytes);
  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    return '';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = numericSize;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function keepLatestChatAttachmentsByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const latestItems: T[] = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const nameKey = normalizeText(item.name);
    if (!nameKey || seen.has(nameKey)) {
      continue;
    }
    seen.add(nameKey);
    latestItems.push(item);
  }

  return latestItems.reverse();
}

function normalizeReference(input: Record<string, unknown>): ChatAttachmentReference {
  const sizeBytes = Number(input.sizeBytes ?? input.size);
  return {
    id: normalizeText(input.id) || undefined,
    type: normalizeText(input.type) || undefined,
    name: normalizeText(input.name) || undefined,
    mimeType: normalizeText(input.mimeType) || undefined,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : undefined,
    url: normalizeText(input.url) || undefined,
    sha256: normalizeText(input.sha256) || undefined
  };
}

export function normalizeChatAttachmentReferences(input: unknown): ChatAttachmentReference[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const references = input
    .filter(isObjectRecord)
    .map(normalizeReference)
    .filter((item) => Boolean(item.name || item.id || item.url));
  return keepLatestChatAttachmentsByName(
    references.map((reference, index) => ({
      ...reference,
      name: reference.name || reference.id || reference.url || `attachment-${index + 1}`
    }))
  );
}

export function parseChatAttachmentReferencesJson(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  try {
    return normalizeChatAttachmentReferences(JSON.parse(text));
  } catch {
    return [];
  }
}

export function serializeChatAttachmentReferences(
  references: readonly ChatAttachmentReference[] | null | undefined
): string {
  return JSON.stringify(normalizeChatAttachmentReferences(references ? [...references] : []));
}

function createMessageAttachmentId(input: {
  messageId: string;
  reference: ChatAttachmentReference;
  name: string;
  index: number;
}): string {
  const sourceId = normalizeText(input.reference.id) || normalizeText(input.reference.url) || input.name;
  return `${input.messageId}:attachment:${input.index + 1}:${sourceId}`;
}

export function createMessageAttachmentsFromReferences(input: {
  conversationId: string;
  messageId: string;
  references: unknown;
  createdAt: number;
}): ChatMessageAttachment[] {
  const references = normalizeChatAttachmentReferences(input.references);
  return references.map((reference, index) => {
    const name = reference.name || reference.id || `attachment-${index + 1}`;
    return {
      attachmentId: createMessageAttachmentId({
        messageId: input.messageId,
        reference,
        name,
        index
      }),
      messageId: input.messageId,
      conversationId: input.conversationId,
      name,
      kind: getChatAttachmentKind(reference),
      mimeType: reference.mimeType || null,
      sizeBytes: Number.isFinite(Number(reference.sizeBytes)) ? Number(reference.sizeBytes) : 0,
      width: null,
      height: null,
      localUri: '',
      previewUri: null,
      resourceUrl: reference.url || null,
      sha256: reference.sha256 || null,
      status: 'ready',
      errorReason: null,
      references: [reference],
      createdAt: input.createdAt,
      updatedAt: input.createdAt
    };
  });
}

export function formatChatAttachmentsMessageText(
  attachments: readonly Pick<ChatAttachmentBase, 'kind' | 'name'>[]
): string {
  if (attachments.length === 0) {
    return '';
  }

  const imageCount = attachments.filter((attachment) => attachment.kind === 'image').length;
  const fileCount = attachments.length - imageCount;
  const firstName = normalizeText(attachments[0]?.name);
  if (attachments.length === 1) {
    return attachments[0].kind === 'image'
      ? `上传了图片${firstName ? `：${firstName}` : ''}`
      : `上传了文件${firstName ? `：${firstName}` : ''}`;
  }

  const parts = [imageCount ? `${imageCount} 张图片` : '', fileCount ? `${fileCount} 个文件` : ''].filter(Boolean);
  return `上传了 ${parts.join('、')}`;
}

export function getChatAttachmentStatusLabel(status: ChatAttachmentStatus, t: TFunction = defaultT): string {
  if (status === 'uploading') {
    return t('attachment.status.uploading');
  }
  if (status === 'failed') {
    return t('attachment.status.failed');
  }
  return t('attachment.status.ready');
}

export function areChatAttachmentsEqual(
  left: readonly ChatMessageAttachment[] | undefined,
  right: readonly ChatMessageAttachment[] | undefined
): boolean {
  const leftItems = left || [];
  const rightItems = right || [];
  if (leftItems.length !== rightItems.length) {
    return false;
  }

  return leftItems.every((leftItem, index) => {
    const rightItem = rightItems[index];
    return (
      leftItem.attachmentId === rightItem.attachmentId &&
      leftItem.name === rightItem.name &&
      leftItem.kind === rightItem.kind &&
      leftItem.mimeType === rightItem.mimeType &&
      leftItem.sizeBytes === rightItem.sizeBytes &&
      leftItem.localUri === rightItem.localUri &&
      leftItem.previewUri === rightItem.previewUri &&
      leftItem.resourceUrl === rightItem.resourceUrl &&
      leftItem.status === rightItem.status &&
      leftItem.errorReason === rightItem.errorReason &&
      serializeChatAttachmentReferences(leftItem.references) === serializeChatAttachmentReferences(rightItem.references)
    );
  });
}
