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
  // Image outputs stay visible when the surrounding completed process is folded.
  if (item.kind === 'tool-group' && item.nodes.some((node) => node.toolName.trim() === 'image_generate')) return false;
  if (item.kind === 'tool' && item.node.kind === 'tool' && item.node.toolName.trim() === 'image_generate') return false;
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

function canReusePresentationItem(
  previous: FramedChatTimelinePresentationItem,
  next: FramedChatTimelinePresentationItem
): boolean {
  if (previous === next) return true;
  if (previous.key !== next.key || previous.kind !== next.kind || previous.runId !== next.runId) return false;
  if (
    previous.groupIndex !== next.groupIndex ||
    previous.isFirstInRun !== next.isFirstInRun ||
    previous.isLastInRun !== next.isLastInRun
  )
    return false;
  if (previous.kind === 'process-summary' || next.kind === 'process-summary') {
    return (
      previous.kind === 'process-summary' &&
      next.kind === 'process-summary' &&
      previous.processId === next.processId &&
      previous.terminalStatus === next.terminalStatus &&
      previous.durationMs === next.durationMs &&
      previous.expanded === next.expanded
    );
  }
  if (previous.node !== next.node || previous.nodeId !== next.nodeId) return false;
  if (previous.kind === 'tool-group' && next.kind === 'tool-group') {
    return (
      previous.toolName === next.toolName &&
      previous.toolLabel === next.toolLabel &&
      previous.count === next.count &&
      previous.nodes.length === next.nodes.length &&
      previous.nodes.every((node, index) => node === next.nodes[index])
    );
  }
  if (previous.kind === 'plan' && next.kind === 'plan') {
    return (
      previous.tasks.length === next.tasks.length && previous.tasks.every((node, index) => node === next.tasks[index])
    );
  }
  if (previous.kind === 'task' && next.kind === 'task') {
    return (
      previous.nodes.length === next.nodes.length && previous.nodes.every((node, index) => node === next.nodes[index])
    );
  }
  return true;
}

function reframePresentationItems(
  items: readonly ChatTimelinePresentationItem[],
  previousItems: readonly ChatTimelinePresentationItem[]
): ChatTimelinePresentationItem[] {
  const previousByKey = new Map(previousItems.map((item) => [item.key, item]));
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

    const framedItem =
      item.groupIndex === groupIndex && item.isFirstInRun === isFirstInRun && item.isLastInRun === isLastInRun
        ? item
        : ({
            ...item,
            groupIndex,
            isFirstInRun,
            isLastInRun
          } satisfies FramedChatTimelinePresentationItem);
    const previous = previousByKey.get(item.key);
    return previous && previous.kind !== 'assistant-reply-footer' && canReusePresentationItem(previous, framedItem)
      ? previous
      : framedItem;
  });
}

export function buildChatTimelinePresentationItems(
  state: ChatTimelineState,
  items: readonly ChatTimelineDisplayItem[],
  expandedProcessIds: ReadonlySet<string>,
  previousItems: readonly ChatTimelinePresentationItem[] = []
): ChatTimelinePresentationItem[] {
  const terminalRuns = collectTerminalRuns(state);
  if (terminalRuns.size === 0 || items.length === 0) {
    return [...items];
  }

  const finalAssistantKeys = collectFinalAssistantKeys(items);
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

  return reframePresentationItems(presentationItems, previousItems);
}

export function getChatTimelinePresentationItemType(item: ChatTimelinePresentationItem): string {
  return item.kind;
}
