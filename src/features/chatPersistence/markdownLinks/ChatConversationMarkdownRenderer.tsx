import { memo } from 'react';

import {
  ConversationMarkdownRenderer,
  type ConversationMarkdownRendererProps
} from '../../../shared/components/ConversationMarkdownRenderer.tsx';
import { useConversationMarkdownLinkPress } from './ConversationMarkdownLinkProvider.tsx';

export const ChatConversationMarkdownRenderer = memo(function ChatConversationMarkdownRenderer(
  props: Omit<ConversationMarkdownRendererProps, 'onLinkPress'>
) {
  const handleLinkPress = useConversationMarkdownLinkPress();
  return <ConversationMarkdownRenderer {...props} onLinkPress={handleLinkPress} />;
});
