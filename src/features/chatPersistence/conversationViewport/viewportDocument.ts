import { getChatViewportApi } from '../../../core/api/services/chatApi.ts';
import { createConversationViewportDocumentStore } from './viewportDocumentStore';

export const conversationViewportDocumentStore = createConversationViewportDocumentStore(getChatViewportApi);
