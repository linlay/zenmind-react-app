import type {
  ChatTimelineNode,
  ChatTimelineState,
  ChatTimelineUsageSummary,
} from '../chatTimeline/index.ts';

export type ChatComposerPrimaryAction = 'send-disabled' | 'sending' | 'send' | 'stop' | 'resume';
export type ChatComposerRunAction = Extract<ChatComposerPrimaryAction, 'stop' | 'resume'>;
export type ChatDetailHeaderStatusTone = 'idle' | 'running' | 'error';

export type ChatDetailHeaderRuntimeState = {
  statusTone: ChatDetailHeaderStatusTone;
  statusLabel: string;
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
    statusLabel: statusTone === 'running' ? '运行中' : statusTone === 'error' ? '异常' : '空闲',
    usageLabel,
    usageSummary,
    runAction,
  };
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

    if (isStreamingTimelineNode(node) || node.lifecycle === 'active') {
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
    latestRunLifecycle === 'cancelled' ? 'resume' : null
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
