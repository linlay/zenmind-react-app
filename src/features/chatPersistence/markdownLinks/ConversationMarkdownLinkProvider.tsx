import { getRemoteChatSourceId } from '../chatSource.ts';
import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';

import { useT } from '../../../shared/i18n/index.ts';
import { useAuthenticatedResourcePreview } from '../components/resource/AuthenticatedResourcePreviewProvider.tsx';
import {
  parseConversationMarkdownInternalLink,
  resolveConversationMarkdownLinkPreview
} from './conversationMarkdownLinks.ts';

type ConversationMarkdownLinkPress = (href: string) => boolean;

const ConversationMarkdownLinkContext = createContext<ConversationMarkdownLinkPress>(() => false);

export function useConversationMarkdownLinkPress(): ConversationMarkdownLinkPress {
  return useContext(ConversationMarkdownLinkContext);
}

export function ConversationMarkdownLinkProvider({
  agentKey,
  conversationId,
  children
}: {
  agentKey?: string | null;
  conversationId: string;
  children: ReactNode;
}) {
  const t = useT();
  const { openPreview } = useAuthenticatedResourcePreview();
  const normalizedAgentKey = String(agentKey || '').trim();
  const agentKeyRef = useRef(normalizedAgentKey);
  agentKeyRef.current = normalizedAgentKey;

  const handleLinkPress = useCallback<ConversationMarkdownLinkPress>(
    (href) => {
      const link = parseConversationMarkdownInternalLink(href);
      if (!link) {
        return false;
      }
      const preview = resolveConversationMarkdownLinkPreview(
        link,
        agentKeyRef.current,
        getRemoteChatSourceId(conversationId)
      );
      const initialError =
        preview.errorCode === 'missing_agent_scope'
          ? t('markdownLink.workspaceScopeMissing')
          : preview.errorCode === 'invalid'
            ? t('markdownLink.invalid')
            : '';
      openPreview(preview, initialError);
      return true;
    },
    [conversationId, openPreview, t]
  );

  return (
    <ConversationMarkdownLinkContext.Provider value={handleLinkPress}>
      {children}
    </ConversationMarkdownLinkContext.Provider>
  );
}
