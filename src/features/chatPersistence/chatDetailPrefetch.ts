import { chatSyncService } from '../chatRealtime/chatSyncService';
import type { DirectoryConversationOpenResult } from './chatRepository';
import { getAgentDetailPrewarmKeyForEmptyConversation } from './chatDetailNavigation';
import type { ChatDirectoryItem } from './types';

export function prewarmAgentDetailForEmptyConversation(
  item: ChatDirectoryItem,
  result: DirectoryConversationOpenResult
) {
  const agentKey = getAgentDetailPrewarmKeyForEmptyConversation(item, result);
  if (!agentKey) {
    return;
  }

  void chatSyncService.ensureAgentDetail(agentKey);
}
