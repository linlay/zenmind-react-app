import {
  type AuthenticatedResourcePreviewTarget,
  resolveAuthenticatedResourcePreviewKind
} from './authenticatedResourcePreview.ts';
import { normalizeChatAttachmentResourceUrl } from './chatAttachmentModels.ts';
import type { ChatAttachmentBase } from './types.ts';

export type ChatAttachmentPreviewResolution =
  | { kind: 'blocked'; reason: 'uploading' }
  | {
      kind: 'error';
      reason: 'failed' | 'missing_resource';
      detail: string;
      target: AuthenticatedResourcePreviewTarget;
    }
  | { kind: 'preview'; target: AuthenticatedResourcePreviewTarget };

export function resolveChatAttachmentImageUri(
  attachment: Pick<ChatAttachmentBase, 'localUri' | 'previewUri' | 'resourceUrl'>,
  variant: 'composer' | 'message'
): string {
  const localPreviewUri = attachment.previewUri || attachment.localUri;
  const uri =
    variant === 'message'
      ? attachment.resourceUrl || localPreviewUri || ''
      : localPreviewUri || attachment.resourceUrl || '';
  return normalizeChatAttachmentResourceUrl(uri);
}

export function resolveChatAttachmentPreview(
  attachment: Pick<
    ChatAttachmentBase,
    'attachmentId' | 'errorReason' | 'mimeType' | 'name' | 'resourceUrl' | 'status' | 'updatedAt'
  >
): ChatAttachmentPreviewResolution {
  if (attachment.status === 'uploading') {
    return { kind: 'blocked', reason: 'uploading' };
  }

  const resourceUrl = normalizeChatAttachmentResourceUrl(attachment.resourceUrl);
  const target: AuthenticatedResourcePreviewTarget = {
    key: `${attachment.attachmentId}:${attachment.updatedAt}:${resourceUrl}`,
    name: attachment.name,
    resourceUrl,
    previewKind: resolveAuthenticatedResourcePreviewKind(attachment)
  };
  if (attachment.status === 'failed') {
    return {
      kind: 'error',
      reason: 'failed',
      detail: String(attachment.errorReason || '').trim(),
      target
    };
  }
  if (!resourceUrl) {
    return { kind: 'error', reason: 'missing_resource', detail: '', target };
  }
  return { kind: 'preview', target };
}
