import { memo } from 'react';

import { ConversationMarkdownRenderer } from '../../../shared/components/ConversationMarkdownRenderer';
import type { ConversationMarkdownFenceExtensionSegment } from '../../../shared/markdown/previewSegments';
import { ConversationViewportBlock } from './ConversationViewportBlock';
import {
  CONVERSATION_VIEWPORT_FENCE_EXTENSIONS,
  isConversationViewportFenceData
} from './conversationViewportFence';

function renderConversationFence(segment: ConversationMarkdownFenceExtensionSegment) {
  if (segment.extensionKey !== 'viewport' || !isConversationViewportFenceData(segment.data)) {
    return undefined;
  }
  return (
    <ConversationViewportBlock
      payload={segment.data.payload}
      sourceHash={segment.sourceHash}
      viewportKey={segment.data.viewportKey}
    />
  );
}

export const ConversationContentRenderer = memo(function ConversationContentRenderer({
  markdown,
  streaming = false
}: {
  markdown: string;
  streaming?: boolean;
}) {
  return (
    <ConversationMarkdownRenderer
      fenceExtensions={CONVERSATION_VIEWPORT_FENCE_EXTENSIONS}
      markdown={markdown}
      renderFenceExtension={renderConversationFence}
      streaming={streaming}
    />
  );
});
