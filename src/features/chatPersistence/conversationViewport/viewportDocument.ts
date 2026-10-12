import { getChatViewportApi } from '../../../core/api/services/chatApi.ts';
import type { ChatViewReference } from '../../../core/api/services/chatViewProtocol.ts';
import { chatSyncService } from '../../chatRealtime/chatSyncService';
import { getChatCacheScopeId } from '../cacheScope';
import { createConversationViewportDocumentStore } from './viewportDocumentStore';
import { buildChatViewDocumentHtml } from './viewDocumentHtml';

export function buildConversationViewDocumentKey(chatId: string, view: ChatViewReference, usage: 'display' | 'form', viewError = '', memberKey = ''): string {
  return 'view:' + JSON.stringify([getChatCacheScopeId(), chatId, view, usage, viewError, memberKey]);
}

export const conversationViewportDocumentStore = createConversationViewportDocumentStore(async (key) => {
  if (!key.startsWith('view:')) return getChatViewportApi(key);
  const [, chatId, view, usage, error] = JSON.parse(key.slice(5)) as [string, string, ChatViewReference, 'display' | 'form', string];
  if (error && !view.hash) throw new Error(error);
  const document = await chatSyncService.getViewDocument({ chatId, connectorId: view.connectorId, key: view.key, hash: view.hash, usage });
  return {html: buildChatViewDocumentHtml(document, usage)};
});
