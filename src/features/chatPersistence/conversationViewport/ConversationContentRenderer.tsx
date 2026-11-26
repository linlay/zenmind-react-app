import { memo, useCallback } from 'react';
import type { ConversationMarkdownFenceExtensionSegment } from '../../../shared/markdown/previewSegments';
import type { ChatTimelineViewBinding } from '../../chatTimeline/timelineView';
import { ConversationViewportBlock } from './ConversationViewportBlock';
import { ChatConversationMarkdownRenderer } from '../markdownLinks/ChatConversationMarkdownRenderer.tsx';
import { CONVERSATION_VIEW_FENCE_EXTENSIONS, type ConversationViewFenceData } from './conversationViewportFence';

export const ConversationContentRenderer = memo(function ConversationContentRenderer({
  markdown,
  streaming = false,
  viewBindings,
  runId = ''
}: {
  markdown: string;
  streaming?: boolean;
  viewBindings?: Record<number, ChatTimelineViewBinding>;
  runId?: string;
}) {
  const renderFence = useCallback(
    (segment: ConversationMarkdownFenceExtensionSegment) => {
      const data = segment.data as ConversationViewFenceData;
      const binding = viewBindings?.[data.index];
      const view = binding?.view;
      if (
        segment.extensionKey !== 'view' ||
        data.error ||
        binding?.viewError ||
        !view ||
        view.source !== 'connector' ||
        data.key !== `${view.connectorId}/${view.key}` ||
        !view.hash
      )
        return undefined;
      return <ConversationViewportBlock view={view} payload={data.payload} runId={runId} />;
    },
    [runId, viewBindings]
  );
  return (
    <ChatConversationMarkdownRenderer
      fenceExtensions={CONVERSATION_VIEW_FENCE_EXTENSIONS}
      markdown={markdown}
      renderFenceExtension={renderFence}
      streaming={streaming}
    />
  );
});
