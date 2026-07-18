import type {
  ChatTimelineActiveFrontendTool,
  ChatTimelineFrontendToolResolution,
  ChatTimelineState,
  ChatTimelineToolNode,
} from './types.ts';

const FRONTEND_TOOL_VIEWPORT_TYPES = ['html', 'qlc'] as const;

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeFrontendToolType(value: unknown): 'html' | 'qlc' | '' {
  const type = normalizeText(value).toLowerCase();
  return FRONTEND_TOOL_VIEWPORT_TYPES.some((candidate) => candidate === type)
    ? (type as 'html' | 'qlc')
    : '';
}

export function normalizeFrontendToolParams(value: unknown): Record<string, unknown> | null {
  return isPlainRecord(value) ? { ...value } : null;
}

export function parseFrontendToolArgs(value: string): Record<string, unknown> | null {
  const source = String(value || '').trim();
  if (!source) {
    return null;
  }
  try {
    return normalizeFrontendToolParams(JSON.parse(source));
  } catch {
    return null;
  }
}

function toActiveFrontendTool(
  conversationId: string,
  node: ChatTimelineToolNode
): ChatTimelineActiveFrontendTool | null {
  const toolType = normalizeFrontendToolType(node.toolType);
  if (
    !toolType ||
    !normalizeText(node.viewportKey) ||
    node.lifecycle !== 'active' ||
    node.frontendToolState?.status !== 'active'
  ) {
    return null;
  }

  return {
    key: node.id,
    conversationId,
    runId: node.runId,
    agentKey: node.agentKey,
    toolId: node.toolId,
    toolName: node.toolName,
    toolLabel: node.toolLabel,
    toolType,
    viewportKey: node.viewportKey,
    toolTimeoutMs: node.toolTimeoutMs,
    toolParams: node.toolParams,
    description: node.description,
    createdAt: node.createdAt,
  };
}

export function getActiveChatTimelineFrontendTool(
  state: ChatTimelineState
): ChatTimelineActiveFrontendTool | null {
  for (let index = state.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const node = state.nodesById[state.orderedNodeIds[index]];
    if (node?.kind !== 'tool') {
      continue;
    }
    if (!normalizeFrontendToolType(node.toolType) || !normalizeText(node.viewportKey)) {
      continue;
    }
    // Frontend tools form a single-slot interaction. Once the latest candidate is
    // terminal or locally resolved, an older tool must not reappear.
    return toActiveFrontendTool(state.conversationId, node);
  }
  return null;
}

export function resolveChatTimelineFrontendTool(
  state: ChatTimelineState,
  toolKey: string,
  reason: ChatTimelineFrontendToolResolution,
  resolvedAt = Date.now()
): ChatTimelineState {
  const normalizedKey = normalizeText(toolKey);
  const node = normalizedKey ? state.nodesById[normalizedKey] : null;
  if (
    node?.kind !== 'tool' ||
    node.lifecycle !== 'active' ||
    node.frontendToolState?.status !== 'active'
  ) {
    return state;
  }

  const nextUpdatedAt = Math.max(node.updatedAt, resolvedAt);
  return {
    ...state,
    nodesById: {
      ...state.nodesById,
      [node.id]: {
        ...node,
        frontendToolState: {
          status: 'resolved',
          reason,
          resolvedAt: nextUpdatedAt,
        },
        updatedAt: nextUpdatedAt,
      },
    },
    updatedAt: Math.max(state.updatedAt, nextUpdatedAt),
    revision: state.revision + 1,
  };
}
