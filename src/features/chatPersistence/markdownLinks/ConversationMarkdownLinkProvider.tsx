import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { useT } from '../../../shared/i18n/index.ts';
import { AuthenticatedResourcePreviewModal } from '../components/resource/AuthenticatedResourcePreviewModal.tsx';
import { useAuthenticatedResourceDownload } from '../components/resource/useAuthenticatedResourceDownload.ts';
import {
  parseConversationMarkdownInternalLink,
  resolveConversationMarkdownLinkPreview,
  type ConversationMarkdownLinkPreview
} from './conversationMarkdownLinks.ts';

type ConversationMarkdownLinkPress = (href: string) => boolean;

const ConversationMarkdownLinkContext = createContext<ConversationMarkdownLinkPress>(() => false);

export function useConversationMarkdownLinkPress(): ConversationMarkdownLinkPress {
  return useContext(ConversationMarkdownLinkContext);
}

export function ConversationMarkdownLinkProvider({
  agentKey,
  children
}: {
  agentKey?: string | null;
  children: ReactNode;
}) {
  const t = useT();
  const normalizedAgentKey = String(agentKey || '').trim();
  const agentKeyRef = useRef(normalizedAgentKey);
  agentKeyRef.current = normalizedAgentKey;
  const [preview, setPreview] = useState<ConversationMarkdownLinkPreview | null>(null);
  const resourceDownload = useAuthenticatedResourceDownload(preview?.resourceUrl || '', preview?.name || '');

  useEffect(() => {
    setPreview(null);
  }, [normalizedAgentKey]);

  const handleLinkPress = useCallback<ConversationMarkdownLinkPress>((href) => {
    const link = parseConversationMarkdownInternalLink(href);
    if (!link) {
      return false;
    }
    setPreview(resolveConversationMarkdownLinkPreview(link, agentKeyRef.current));
    return true;
  }, []);
  const handleClose = useCallback(() => setPreview(null), []);
  const initialError =
    preview?.errorCode === 'missing_agent_scope'
      ? t('markdownLink.workspaceScopeMissing')
      : preview?.errorCode === 'invalid'
        ? t('markdownLink.invalid')
        : '';
  const downloadFeedback =
    resourceDownload.state === 'success'
      ? t('artifact.downloaded', { name: resourceDownload.downloadedName || preview?.name || '' })
      : resourceDownload.state === 'error'
        ? t('artifact.downloadFailed')
        : '';

  return (
    <ConversationMarkdownLinkContext.Provider value={handleLinkPress}>
      {children}
      {preview ? (
        <AuthenticatedResourcePreviewModal
          key={preview.key}
          target={preview}
          visible
          initialError={initialError}
          downloadState={resourceDownload.state}
          downloadFeedback={downloadFeedback}
          onClose={handleClose}
          onDownload={resourceDownload.download}
        />
      ) : null}
    </ConversationMarkdownLinkContext.Provider>
  );
}
