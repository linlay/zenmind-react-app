import type { ChatTimelineState, ChatTimelineToolNode } from '../chatTimeline/types.ts';

export type ChatFileOperation = {
  key: string;
  runId: string;
  callId: string;
  filePath: string;
  agentKey: string;
  operation: 'write' | 'edit';
  addedLines: number | null;
  deletedLines: number | null;
  editedLines: number | null;
  updatedAt: number;
};
export type ChatFileChange = {
  key: string;
  runId: string;
  filePath: string;
  addedLines: number | null;
  deletedLines: number | null;
  editedLines: number | null;
  operations: ChatFileOperation[];
};
const MAX_RESULT_CHARS = 128 * 1024;
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function count(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function projectOperation(node: ChatTimelineToolNode): ChatFileOperation | null {
  const name = node.toolName.trim().toLowerCase();
  if (
    !['file_write', 'file_edit'].includes(name) ||
    node.lifecycle !== 'complete' ||
    ['failed', 'error', 'cancelled'].includes(node.status) ||
    node.errorDetail ||
    !node.runId ||
    !Number.isFinite(node.updatedAt) ||
    node.updatedAt <= 0 ||
    !node.resultText ||
    node.resultText.length > MAX_RESULT_CHARS
  )
    return null;
  let result: Record<string, unknown> | null;
  try {
    result = record(JSON.parse(node.resultText));
  } catch {
    return null;
  }
  if (
    !result ||
    result.error ||
    result.ok === false ||
    (result.exitCode !== undefined && result.exitCode !== 0) ||
    result.status !== (name === 'file_write' ? 'written' : 'edited')
  )
    return null;
  const filePath = typeof result.filePath === 'string' ? result.filePath.trim() : '';
  if (!filePath || filePath.length > 4096 || /[\u0000-\u001f\u007f]/u.test(filePath)) return null;
  const stats = record(result.lineStats),
    callId = node.toolId || node.id;
  return {
    key: JSON.stringify([node.runId, filePath, callId]),
    runId: node.runId,
    callId,
    filePath,
    agentKey: node.agentKey,
    operation: name === 'file_write' ? 'write' : 'edit',
    addedLines: count(stats?.addedLines),
    deletedLines: count(stats?.deletedLines),
    editedLines: count(stats?.editedLines),
    updatedAt: node.updatedAt
  };
}
function sum(operations: ChatFileOperation[], field: 'addedLines' | 'deletedLines' | 'editedLines'): number | null {
  let total = 0;
  for (const operation of operations) {
    if (operation[field] === null || !Number.isSafeInteger(total + operation[field])) return null;
    total += operation[field];
  }
  return total;
}

/** The opened panel owns this disposable projection; never keep a second file-change store. */
export function createChatFileChangesProjector() {
  let cache = new WeakMap<ChatTimelineToolNode, ChatFileOperation | null>();
  let conversationId = '',
    previousOperations: ChatFileOperation[] = [],
    previous: ChatFileChange[] = [];
  return (state: ChatTimelineState): ChatFileChange[] => {
    if (conversationId !== state.conversationId) {
      cache = new WeakMap();
      conversationId = state.conversationId;
      previousOperations = [];
      previous = [];
    }
    const calls = new Map<string, { updatedAt: number; operation: ChatFileOperation | null }>();
    for (const id of state.orderedNodeIds) {
      const node = state.nodesById[id];
      if (node?.kind !== 'tool' || !['file_write', 'file_edit'].includes(node.toolName.trim().toLowerCase())) continue;
      if (!cache.has(node)) cache.set(node, projectOperation(node));
      const operation = cache.get(node) ?? null;
      const key = JSON.stringify([node.runId, node.toolId || node.id]),
        existing = calls.get(key);
      if (!existing || node.updatedAt > existing.updatedAt) calls.set(key, { updatedAt: node.updatedAt, operation });
    }
    const operations = [...calls.values()].flatMap((entry) => (entry.operation ? [entry.operation] : []));
    if (
      operations.length === previousOperations.length &&
      operations.every((op, index) => op === previousOperations[index])
    )
      return previous;
    const groups = new Map<string, ChatFileChange>();
    for (const op of operations) {
      const key = JSON.stringify([op.runId, op.filePath]);
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          runId: op.runId,
          filePath: op.filePath,
          addedLines: null,
          deletedLines: null,
          editedLines: null,
          operations: []
        };
        groups.set(key, group);
      }
      group.operations.push(op);
    }
    for (const group of groups.values()) {
      group.addedLines = sum(group.operations, 'addedLines');
      group.deletedLines = sum(group.operations, 'deletedLines');
      group.editedLines = sum(group.operations, 'editedLines');
    }
    previousOperations = operations;
    previous = [...groups.values()];
    return previous;
  };
}
