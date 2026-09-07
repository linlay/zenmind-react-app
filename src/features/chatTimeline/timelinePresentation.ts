import type {
  ChatTimelineDisplayItem,
  ChatTimelinePresentationItem,
  ChatTimelineProcessSummaryDisplayItem,
  ChatTimelineProcessTerminalStatus,
  ChatTimelineRunNode,
  ChatTimelineState
} from './types.ts';

const PROCESS_ITEM_KINDS = new Set<ChatTimelineDisplayItem['kind']>([
  'assistant-content',
  'reasoning',
  'planning',
  'tool',
  'tool-group',
  'awaiting',
  'source',
  'action',
  'plan',
  'task',
  'context',
  'request'
]);

type TerminalRunPresentation = {
  durationMs: number | null;
  status: ChatTimelineProcessTerminalStatus;
};

type FramedChatTimelinePresentationItem = Exclude<ChatTimelinePresentationItem, { kind: 'assistant-reply-footer' }>;

function normalizeDurationMs(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function getTerminalRunStatus(node: ChatTimelineRunNode): ChatTimelineProcessTerminalStatus | null {
  if (node.lifecycle === 'complete') {
    return 'completed';
  }
  if (node.lifecycle === 'cancelled') {
    return 'cancelled';
  }
  if (node.lifecycle === 'error') {
    return 'error';
  }
  return null;
}

function collectTerminalRuns(state: ChatTimelineState): Map<string, TerminalRunPresentation> {
  const terminalRuns = new Map<string, TerminalRunPresentation>();

  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (node?.kind !== 'run' || !node.runId) {
      return;
    }

    // Only explicit terminal run events set completedAt. Availability/local
    // fallbacks must keep the live timeline visible.
    if (node.completedAt === null) {
      terminalRuns.delete(node.runId);
      return;
    }

    const status = getTerminalRunStatus(node);
    if (!status) {
      terminalRuns.delete(node.runId);
      return;
    }

    terminalRuns.set(node.runId, {
      durationMs: normalizeDurationMs(node.durationMs),
      status
    });
  });

  return terminalRuns;
}

function collectFinalAssistantKeys(items: readonly ChatTimelineDisplayItem[]): Map<string, string> {
  const finalAssistantKeys = new Map<string, string>();

  items.forEach((item) => {
    if (item.kind === 'assistant-content' && item.runId) {
      finalAssistantKeys.set(item.runId, item.key);
    }
  });

  return finalAssistantKeys;
}

function isProcessItem(
  item: ChatTimelineDisplayItem,
  terminalRuns: ReadonlyMap<string, TerminalRunPresentation>,
  finalAssistantKeys: ReadonlyMap<string, string>
): boolean {
  if (!item.runId || !terminalRuns.has(item.runId) || !PROCESS_ITEM_KINDS.has(item.kind)) {
    return false;
  }
  return item.kind !== 'assistant-content' || finalAssistantKeys.get(item.runId) !== item.key;
}

function createProcessId(conversationId: string, runId: string): string {
  return `process:${conversationId}:${runId}`;
}

function createProcessSummary(
  conversationId: string,
  runId: string,
  terminalRun: TerminalRunPresentation,
  expanded: boolean
): ChatTimelineProcessSummaryDisplayItem {
  const processId = createProcessId(conversationId, runId);
  return {
    key: `process-summary:${conversationId}:${runId}`,
    kind: 'process-summary',
    processId,
    runId,
    terminalStatus: terminalRun.status,
    durationMs: terminalRun.durationMs,
    expanded,
    isFirstInRun: false,
    isLastInRun: false,
    groupIndex: 0
  };
}

function reframePresentationItems(items: readonly ChatTimelinePresentationItem[]): ChatTimelinePresentationItem[] {
  const runCounts = new Map<string, number>();
  items.forEach((item) => {
    if (item.kind !== 'assistant-reply-footer') {
      runCounts.set(item.runId, (runCounts.get(item.runId) ?? 0) + 1);
    }
  });

  const runIndexes = new Map<string, number>();
  return items.map((item) => {
    if (item.kind === 'assistant-reply-footer') {
      return item;
    }

    const groupIndex = runIndexes.get(item.runId) ?? 0;
    const groupCount = runCounts.get(item.runId) ?? 1;
    const isFirstInRun = groupIndex === 0;
    const isLastInRun = groupIndex === groupCount - 1;
    runIndexes.set(item.runId, groupIndex + 1);

    if (item.groupIndex === groupIndex && item.isFirstInRun === isFirstInRun && item.isLastInRun === isLastInRun) {
      return item;
    }

    return {
      ...item,
      groupIndex,
      isFirstInRun,
      isLastInRun
    } satisfies FramedChatTimelinePresentationItem;
  });
}

export function buildChatTimelinePresentationItems(
  state: ChatTimelineState,
  items: readonly ChatTimelineDisplayItem[],
  expandedProcessIds: ReadonlySet<string>
): ChatTimelinePresentationItem[] {
  const terminalRuns = collectTerminalRuns(state);
  if (terminalRuns.size === 0 || items.length === 0) {
    return [...items];
  }

  const finalAssistantKeys = collectFinalAssistantKeys(items);
  const processRunIds = new Set<string>();
  items.forEach((item) => {
    if (isProcessItem(item, terminalRuns, finalAssistantKeys)) {
      processRunIds.add(item.runId);
    }
  });
  if (processRunIds.size === 0) {
    return [...items];
  }

  const insertedSummaryRunIds = new Set<string>();
  const presentationItems: ChatTimelinePresentationItem[] = [];

  items.forEach((item) => {
    if (!isProcessItem(item, terminalRuns, finalAssistantKeys)) {
      presentationItems.push(item);
      return;
    }

    const terminalRun = terminalRuns.get(item.runId);
    if (!terminalRun) {
      presentationItems.push(item);
      return;
    }

    const processId = createProcessId(state.conversationId, item.runId);
    const expanded = expandedProcessIds.has(processId);
    if (!insertedSummaryRunIds.has(item.runId)) {
      insertedSummaryRunIds.add(item.runId);
      presentationItems.push(createProcessSummary(state.conversationId, item.runId, terminalRun, expanded));
    }
    if (expanded) {
      presentationItems.push(item);
    }
  });

  return reframePresentationItems(presentationItems);
}

export function getChatTimelinePresentationItemType(item: ChatTimelinePresentationItem): string {
  return item.kind;
}
