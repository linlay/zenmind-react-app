import type { ChatViewReference } from '../../../core/api/services/chatViewProtocol.ts';
import { chatSyncService } from '../../chatRealtime/chatSyncService';
import { getChatCacheScopeId } from '../cacheScope';
import { createConversationViewportDocumentStore } from './viewportDocumentStore';
import { buildChatViewDocumentHtml } from './viewDocumentHtml';

export function buildConversationViewDocumentKey(
  chatId: string,
  view: ChatViewReference,
  usage: 'display' | 'form',
  viewError = ''
): string {
  return 'view:' + JSON.stringify([getChatCacheScopeId(), chatId, view, usage, viewError]);
}

export const conversationViewportDocumentStore = createConversationViewportDocumentStore(async (key) => {
  if (!key.startsWith('view:')) throw new Error('Invalid VIEW document key');
  const [, chatId, view, usage, error] = JSON.parse(key.slice(5)) as [
    string,
    string,
    ChatViewReference,
    'display' | 'form',
    string
  ];
  if (error) throw new Error(error);
  if (view.source === 'connector' && !view.hash) throw new Error('VIEW snapshot hash is required');
  const document = await chatSyncService.getViewDocument({
    chatId,
    key: view.key,
    usage,
    ...(view.source === 'builtin'
      ? { source: 'builtin' }
      : { source: 'connector', connectorId: view.connectorId, hash: view.hash! })
  });
  if (
    (view.renderer && document.view.renderer !== view.renderer) ||
    (view.version && document.view.version !== view.version)
  )
    throw new Error('VIEW rendering metadata mismatch');
  return { view: document.view, html: buildChatViewDocumentHtml(document, usage) };
});
