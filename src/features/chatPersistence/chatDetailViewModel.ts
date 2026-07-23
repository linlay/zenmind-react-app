import type {
  ChatTimelineDisplayItem,
  ChatTimelineNode,
  ChatTimelineState,
  ChatTimelineUsageSummary,
} from '../chatTimeline/index.ts';
import { hasChatUsageStatsData } from './chatDetailFormatters.ts';

export type ChatComposerPrimaryAction = 'send-disabled' | 'sending' | 'send' | 'stop' | 'resume';
export type ChatComposerRunAction = Extract<ChatComposerPrimaryAction, 'stop' | 'resume'>;
export type ChatDetailHeaderStatusTone = 'idle' | 'running' | 'error';

export type ChatDetailHeaderRuntimeState = {
  statusTone: ChatDetailHeaderStatusTone;
  usageLabel: string;
  usageSummary: ChatTimelineUsageSummary | null;
  runAction: ChatComposerRunAction | null;
};

type ComposerActionInput = {
  draft: string;
  sending: boolean;
  runAction: ChatComposerRunAction | null;
  hasReadyAttachments?: boolean;
  attachmentsBlocked?: boolean;
};

function isStreamingTimelineNode(node: ChatTimelineNode): boolean {
  return 'streaming' in node && node.streaming;
}

function getRunScopeKey(runId: string): string {
  return runId || '__runless__';
}

function buildHeaderRuntimeState(
  statusTone: ChatDetailHeaderStatusTone,
  usageLabel: string,
  usageSummary: ChatTimelineUsageSummary | null,
  runAction: ChatComposerRunAction | null
): ChatDetailHeaderRuntimeState {
  return {
    statusTone,
    usageLabel,
    usageSummary,
    runAction,
  };
}

function hasUsageNumber(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

export function hasDisplayableChatTimelineUsageSummary(
  usageSummary: ChatTimelineUsageSummary | null | undefined
): usageSummary is ChatTimelineUsageSummary {
  return Boolean(
    usageSummary &&
      (hasUsageNumber(usageSummary.contextWindow.currentSize) ||
        hasUsageNumber(usageSummary.contextWindow.maxSize) ||
        hasUsageNumber(usageSummary.contextWindow.estimatedNextCallSize) ||
        hasUsageNumber(usageSummary.contextWindow.percent) ||
        hasChatUsageStatsData(usageSummary.current) ||
        hasChatUsageStatsData(usageSummary.run) ||
        hasChatUsageStatsData(usageSummary.chat) ||
        hasChatUsageStatsData(usageSummary.compact))
  );
}

export function deriveChatDetailHeaderRuntimeState(
  timelineState: ChatTimelineState
): ChatDetailHeaderRuntimeState {
  const usageLabel = timelineState.usageLabel;
  const usageSummary = timelineState.usageSummary;

  if (timelineState.activeRunId) {
    return buildHeaderRuntimeState('running', usageLabel, usageSummary, 'stop');
  }

  let latestRunLifecycle: ChatTimelineNode['lifecycle'] | null = null;
  let hasRunError = false;
  const terminalRunScopes = new Set<string>();

  for (let index = timelineState.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const node = timelineState.nodesById[timelineState.orderedNodeIds[index]];
    if (!node) {
      continue;
    }

    if (node.kind === 'run') {
      latestRunLifecycle ??= node.lifecycle;
      if (node.lifecycle === 'error') {
        hasRunError = true;
      }
      const runScopeKey = getRunScopeKey(node.runId);
      if (node.lifecycle === 'active' && !terminalRunScopes.has(runScopeKey)) {
        return buildHeaderRuntimeState('running', usageLabel, usageSummary, 'stop');
      }
      if (node.lifecycle !== 'active') {
        terminalRunScopes.add(runScopeKey);
      }
      continue;
    }

    if (
      node.kind !== 'awaiting' &&
      (isStreamingTimelineNode(node) || node.lifecycle === 'active')
    ) {
      const runScopeKey = getRunScopeKey(node.runId);
      if (terminalRunScopes.has(runScopeKey) || (!node.runId && terminalRunScopes.size > 0)) {
        continue;
      }
      return buildHeaderRuntimeState('running', usageLabel, usageSummary, 'stop');
    }
  }

  if (hasRunError) {
    return buildHeaderRuntimeState(
      'error',
      usageLabel,
      usageSummary,
      latestRunLifecycle === 'error' ? 'resume' : null
    );
  }

  return buildHeaderRuntimeState(
    'idle',
    usageLabel,
    usageSummary,
    null
  );
}

export function shouldShowChatResponseWaitingIndicator(
  activeRunId: string,
  items: readonly ChatTimelineDisplayItem[]
): boolean {
  const normalizedActiveRunId = String(activeRunId || '').trim();
  if (!normalizedActiveRunId) {
    return false;
  }

  return !items.some(
    (item) => item.runId === normalizedActiveRunId && item.kind !== 'user-query' && item.kind !== 'request'
  );
}

export function deriveChatComposerPrimaryAction({
  draft,
  sending,
  runAction,
  hasReadyAttachments = false,
  attachmentsBlocked = false,
}: ComposerActionInput): ChatComposerPrimaryAction {
  if (runAction) {
    return runAction;
  }
  if (sending) {
    return 'sending';
  }
  if (attachmentsBlocked) {
    return 'send-disabled';
  }
  return draft.trim() || hasReadyAttachments ? 'send' : 'send-disabled';
}
