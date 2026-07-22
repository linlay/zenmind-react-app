import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { ChatUploadError, extractUploadReferences, uploadChatAttachmentApi } from '../../core/api/services/uploadApi';
import { useT } from '../../shared/i18n';
import {
  getChatAttachmentExtension,
  getChatAttachmentKind,
  keepLatestChatAttachmentsByName
} from './chatAttachmentModels';
import type { ChatAttachmentKind, ChatComposerAttachment } from './types';

const MAX_COMPOSER_ATTACHMENTS = 6;
const MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_UPLOAD_CONCURRENCY = 2;

type PickedComposerAttachment = {
  name: string;
  kind: ChatAttachmentKind;
  mimeType: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  localUri: string;
  previewUri: string | null;
};

type UseChatComposerAttachmentsInput = {
  conversationId: string;
  disabled?: boolean;
  onError?: (message: string) => void;
};

function createAttachmentId(): string {
  return `upload_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function filenameFromUri(uri: string, fallbackPrefix: string): string {
  const path = normalizeText(uri).split(/[?#]/, 1)[0];
  const lastSegment = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)).trim();
  if (lastSegment) {
    return lastSegment;
  }
  return `${fallbackPrefix}-${Date.now()}`;
}

function inferMimeTypeFromName(name: string, fallback = 'application/octet-stream'): string {
  const extension = getChatAttachmentExtension(name);
  if (!extension) {
    return fallback;
  }
  if (['jpg', 'jpeg'].includes(extension)) {
    return 'image/jpeg';
  }
  if (extension === 'png') {
    return 'image/png';
  }
  if (extension === 'gif') {
    return 'image/gif';
  }
  if (extension === 'webp') {
    return 'image/webp';
  }
  if (extension === 'pdf') {
    return 'application/pdf';
  }
  if (['txt', 'md', 'log'].includes(extension)) {
    return 'text/plain';
  }
  return fallback;
}

function isPickedComposerAttachment(value: PickedComposerAttachment | null): value is PickedComposerAttachment {
  return Boolean(value);
}

function getUploadErrorMessage(error: unknown, t: ReturnType<typeof useT>): string {
  if (error instanceof ChatUploadError) {
    if (error.code === 'invalid_tunnel_profile') {
      return t('attachment.error.invalidTunnelProfile');
    }
    if (error.code === 'unexpected_response') {
      return t('attachment.error.unexpectedResponse');
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function createPendingAttachment(conversationId: string, picked: PickedComposerAttachment): ChatComposerAttachment {
  const createdAt = Date.now();
  return {
    attachmentId: createAttachmentId(),
    conversationId,
    name: picked.name,
    kind: picked.kind,
    mimeType: picked.mimeType,
    sizeBytes: picked.sizeBytes,
    width: picked.width,
    height: picked.height,
    localUri: picked.localUri,
    previewUri: picked.previewUri,
    resourceUrl: null,
    sha256: null,
    status: 'uploading',
    errorReason: null,
    references: [],
    createdAt,
    updatedAt: createdAt
  };
}

function normalizeImageAsset(asset: ImagePicker.ImagePickerAsset): PickedComposerAttachment | null {
  const uri = normalizeText(asset.uri);
  if (!uri) {
    return null;
  }
  const name = normalizeText(asset.fileName) || filenameFromUri(uri, 'image');
  const mimeType = normalizeText(asset.mimeType) || inferMimeTypeFromName(name, 'image/jpeg');
  return {
    name,
    kind: 'image',
    mimeType,
    sizeBytes: Number.isFinite(Number(asset.fileSize)) ? Number(asset.fileSize) : 0,
    width: Number.isFinite(Number(asset.width)) ? Number(asset.width) : null,
    height: Number.isFinite(Number(asset.height)) ? Number(asset.height) : null,
    localUri: uri,
    previewUri: uri
  };
}

function normalizeDocumentAsset(asset: DocumentPicker.DocumentPickerAsset): PickedComposerAttachment | null {
  const uri = normalizeText(asset.uri);
  if (!uri) {
    return null;
  }
  const name = normalizeText(asset.name) || filenameFromUri(uri, 'file');
  const mimeType = normalizeText(asset.mimeType) || inferMimeTypeFromName(name);
  return {
    name,
    kind: getChatAttachmentKind({ name, mimeType }),
    mimeType,
    sizeBytes: Number.isFinite(Number(asset.size)) ? Number(asset.size) : 0,
    width: null,
    height: null,
    localUri: uri,
    previewUri: getChatAttachmentKind({ name, mimeType }) === 'image' ? uri : null
  };
}

export function useChatComposerAttachments({
  conversationId,
  disabled = false,
  onError
}: UseChatComposerAttachmentsInput) {
  const t = useT();
  const [attachments, setAttachments] = useState<ChatComposerAttachment[]>([]);
  const attachmentsRef = useRef<ChatComposerAttachment[]>([]);
  const latestAttachmentIdByNameRef = useRef(new Map<string, string>());
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const uploadQueueRef = useRef<ChatComposerAttachment[]>([]);
  const activeUploadCountRef = useRef(0);

  const readyAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.status === 'ready'),
    [attachments]
  );
  const hasUploadingAttachments = useMemo(
    () => attachments.some((attachment) => attachment.status === 'uploading'),
    [attachments]
  );
  const hasFailedAttachments = useMemo(
    () => attachments.some((attachment) => attachment.status === 'failed'),
    [attachments]
  );

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const reportError = useCallback(
    (message: string) => {
      const text = normalizeText(message);
      if (text) {
        onError?.(text);
      }
    },
    [onError]
  );

  const uploadAttachment = useCallback(
    async (attachment: ChatComposerAttachment) => {
      const controller = new AbortController();
      abortControllersRef.current.set(attachment.attachmentId, controller);
      try {
        const response = await uploadChatAttachmentApi({
          uri: attachment.localUri,
          name: attachment.name,
          mimeType: attachment.mimeType,
          requestId: attachment.attachmentId,
          chatId: conversationId,
          sha256: attachment.sha256,
          signal: controller.signal
        });
        const latestAttachmentId = latestAttachmentIdByNameRef.current.get(attachment.name);
        if (latestAttachmentId !== attachment.attachmentId || controller.signal.aborted) {
          return;
        }
        const references = extractUploadReferences(response);
        if (references.length === 0) {
          throw new Error(t('attachment.error.missingReference'));
        }
        const [reference] = references;
        const now = Date.now();
        setAttachments((current) =>
          current.map((item) =>
            item.attachmentId === attachment.attachmentId
              ? {
                  ...item,
                  kind: getChatAttachmentKind({
                    type: reference?.type,
                    name: reference?.name || item.name,
                    mimeType: reference?.mimeType || item.mimeType
                  }),
                  name: reference?.name || item.name,
                  mimeType: reference?.mimeType || item.mimeType,
                  sizeBytes:
                    Number.isFinite(Number(reference?.sizeBytes)) && Number(reference?.sizeBytes) >= 0
                      ? Number(reference?.sizeBytes)
                      : item.sizeBytes,
                  resourceUrl: reference?.url || item.resourceUrl,
                  sha256: reference?.sha256 || item.sha256,
                  status: 'ready',
                  errorReason: null,
                  references,
                  updatedAt: now
                }
              : item
          )
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const latestAttachmentId = latestAttachmentIdByNameRef.current.get(attachment.name);
        if (latestAttachmentId !== attachment.attachmentId) {
          return;
        }
        const errorText = getUploadErrorMessage(error, t);
        reportError(errorText);
        const now = Date.now();
        setAttachments((current) =>
          current.map((item) =>
            item.attachmentId === attachment.attachmentId
              ? {
                  ...item,
                  status: 'failed',
                  errorReason: errorText || t('attachment.status.failed'),
                  references: [],
                  updatedAt: now
                }
              : item
          )
        );
      } finally {
        abortControllersRef.current.delete(attachment.attachmentId);
      }
    },
    [conversationId, reportError, t]
  );

  const drainUploadQueue = useCallback(() => {
    while (activeUploadCountRef.current < MAX_UPLOAD_CONCURRENCY && uploadQueueRef.current.length > 0) {
      const attachment = uploadQueueRef.current.shift();
      if (!attachment) {
        continue;
      }
      const latestAttachmentId = latestAttachmentIdByNameRef.current.get(attachment.name);
      if (latestAttachmentId !== attachment.attachmentId) {
        continue;
      }

      activeUploadCountRef.current += 1;
      void uploadAttachment(attachment).finally(() => {
        activeUploadCountRef.current = Math.max(0, activeUploadCountRef.current - 1);
        drainUploadQueue();
      });
    }
  }, [uploadAttachment]);

  const enqueueUpload = useCallback(
    (attachment: ChatComposerAttachment) => {
      uploadQueueRef.current = uploadQueueRef.current.filter((item) => item.attachmentId !== attachment.attachmentId);
      uploadQueueRef.current.push(attachment);
      drainUploadQueue();
    },
    [drainUploadQueue]
  );

  const addPickedAttachments = useCallback(
    (pickedAttachments: PickedComposerAttachment[]) => {
      if (disabled || pickedAttachments.length === 0) {
        return;
      }

      const validPickedAttachments = pickedAttachments.filter((attachment) => {
        if (attachment.sizeBytes > 0 && attachment.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
          reportError(t('attachment.error.tooLarge', { name: attachment.name }));
          return false;
        }
        return true;
      });
      const latestPickedAttachments = keepLatestChatAttachmentsByName(validPickedAttachments);
      const currentNamesToReplace = new Set(latestPickedAttachments.map((item) => item.name));
      const retainedCount = attachmentsRef.current.filter(
        (attachment) => !currentNamesToReplace.has(attachment.name)
      ).length;
      const availableSlots = Math.max(MAX_COMPOSER_ATTACHMENTS - retainedCount, 0);
      const acceptedPickedAttachments = latestPickedAttachments.slice(0, availableSlots);
      if (latestPickedAttachments.length > acceptedPickedAttachments.length) {
        reportError(t('attachment.error.tooMany', { count: MAX_COMPOSER_ATTACHMENTS }));
      }

      const nextAttachments = acceptedPickedAttachments.map((attachment) =>
        createPendingAttachment(conversationId, attachment)
      );
      if (nextAttachments.length === 0) {
        return;
      }

      nextAttachments.forEach((attachment) => {
        latestAttachmentIdByNameRef.current.set(attachment.name, attachment.attachmentId);
      });
      setAttachments((current) => {
        const retainedAttachments = current.filter((attachment) => {
          const shouldReplace = currentNamesToReplace.has(attachment.name);
          if (shouldReplace) {
            uploadQueueRef.current = uploadQueueRef.current.filter(
              (item) => item.attachmentId !== attachment.attachmentId
            );
            abortControllersRef.current.get(attachment.attachmentId)?.abort();
            abortControllersRef.current.delete(attachment.attachmentId);
          }
          return !shouldReplace;
        });
        return [...retainedAttachments, ...nextAttachments];
      });
      nextAttachments.forEach((attachment) => {
        enqueueUpload(attachment);
      });
    },
    [conversationId, disabled, enqueueUpload, reportError, t]
  );

  const handleSelectAttachment = useCallback(
    async (type: ChatAttachmentKind) => {
      if (disabled) {
        return;
      }
      try {
        if (type === 'image') {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: MAX_COMPOSER_ATTACHMENTS,
            allowsEditing: false,
            base64: false,
            exif: false,
            quality: 1
          });
          if (!result.canceled) {
            addPickedAttachments(result.assets.map(normalizeImageAsset).filter(isPickedComposerAttachment));
          }
          return;
        }

        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          multiple: true,
          copyToCacheDirectory: true,
          base64: false
        });
        if (!result.canceled) {
          addPickedAttachments(result.assets.map(normalizeDocumentAsset).filter(isPickedComposerAttachment));
        }
      } catch (error) {
        reportError(error instanceof Error ? error.message : String(error));
      }
    },
    [addPickedAttachments, disabled, reportError]
  );

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.attachmentId === attachmentId);
      if (removed) {
        uploadQueueRef.current = uploadQueueRef.current.filter(
          (attachment) => attachment.attachmentId !== attachmentId
        );
        abortControllersRef.current.get(attachmentId)?.abort();
        abortControllersRef.current.delete(attachmentId);
        if (latestAttachmentIdByNameRef.current.get(removed.name) === attachmentId) {
          latestAttachmentIdByNameRef.current.delete(removed.name);
        }
      }
      return current.filter((attachment) => attachment.attachmentId !== attachmentId);
    });
  }, []);

  const handleRetryAttachment = useCallback(
    (attachmentId: string) => {
      const attachment = attachmentsRef.current.find((item) => item.attachmentId === attachmentId);
      if (!attachment || attachment.status !== 'failed') {
        return;
      }
      latestAttachmentIdByNameRef.current.set(attachment.name, attachment.attachmentId);
      const now = Date.now();
      const nextAttachment = {
        ...attachment,
        status: 'uploading' as const,
        errorReason: null,
        updatedAt: now
      };
      setAttachments((current) => current.map((item) => (item.attachmentId === attachmentId ? nextAttachment : item)));
      enqueueUpload(nextAttachment);
    },
    [enqueueUpload]
  );

  const clearAttachments = useCallback(() => {
    uploadQueueRef.current = [];
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    latestAttachmentIdByNameRef.current.clear();
    setAttachments([]);
  }, []);

  useEffect(() => {
    clearAttachments();
  }, [clearAttachments, conversationId]);

  useEffect(
    () => () => {
      uploadQueueRef.current = [];
      abortControllersRef.current.forEach((controller) => controller.abort());
      abortControllersRef.current.clear();
      latestAttachmentIdByNameRef.current.clear();
    },
    []
  );

  return {
    attachments,
    readyAttachments,
    hasUploadingAttachments,
    hasFailedAttachments,
    handleSelectAttachment,
    handleRemoveAttachment,
    handleRetryAttachment,
    clearAttachments
  };
}
