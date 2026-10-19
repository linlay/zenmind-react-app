import type { ChatTimelineNode } from './types.ts';

function isQuery(node: ChatTimelineNode): boolean {
  return node.kind === 'message' && node.role === 'user' && node.messageVariant === 'default';
}

/** Creation time owns position. A late request still anchors its own Run. */
export function orderChatTimelineNodes(ids: string[], nodes: Record<string, ChatTimelineNode>): string[] {
  const requests = new Map<string, number>();
  for (const id of ids) {
    const node = nodes[id];
    if (node?.runId && isQuery(node)) {
      requests.set(node.runId, Math.min(requests.get(node.runId) ?? Infinity, node.createdAt));
    }
  }
  const compare = (leftId: string, rightId: string): number => {
    const left = nodes[leftId];
    const right = nodes[rightId];
    if (!left || !right) return 0;
    const instant = (node: ChatTimelineNode) => Math.max(node.createdAt, requests.get(node.runId) ?? 0);
    const time = instant(left) - instant(right);
    if (time) return time;
    const rank = (node: ChatTimelineNode) => (isQuery(node) ? 0 : node.kind === 'run' ? 1 : 2);
    return rank(left) - rank(right) || left.order - right.order || leftId.localeCompare(rightId);
  };
  // Preserve the reference for already ordered snapshots and streaming updates.
  for (let index = 1; index < ids.length; index++) {
    if (compare(ids[index - 1], ids[index]) > 0) return [...ids].sort(compare);
  }
  return ids;
}
