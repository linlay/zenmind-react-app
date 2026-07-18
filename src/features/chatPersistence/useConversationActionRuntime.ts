import { useEffect } from 'react';

import { useAppTheme } from '../../shared/visual/AppThemeProvider.tsx';
import { chatSyncService } from '../chatRealtime/chatSyncService.ts';
import { conversationActionService } from './conversationActionService.ts';

export function useConversationActionRuntime(conversationIdInput: string): void {
  const conversationId = String(conversationIdInput || '').trim();
  const { setThemePreference } = useAppTheme();

  useEffect(() => {
    if (!conversationId) {
      return undefined;
    }
    let active = true;
    conversationActionService.resetConversationBuffers(conversationId);
    const unsubscribe = chatSyncService.subscribe((event) => {
      if (event.type !== 'conversation.action.protocol' || event.conversationId !== conversationId) {
        return;
      }
      void conversationActionService
        .handleProtocolEvent(conversationId, event.event, {
          setTheme: setThemePreference
        })
        .then((outcome) => {
          if (!active || !outcome || outcome.duplicate || outcome.status === 'blocked') {
            return;
          }
          chatSyncService.recordActionExecution(conversationId, {
            actionId: outcome.actionId,
            actionName: outcome.actionName,
            status: outcome.status,
            result: outcome.result,
            reason: outcome.reason
          });
        });
    });

    return () => {
      active = false;
      unsubscribe();
      conversationActionService.resetConversationBuffers(conversationId);
    };
  }, [conversationId, setThemePreference]);
}
