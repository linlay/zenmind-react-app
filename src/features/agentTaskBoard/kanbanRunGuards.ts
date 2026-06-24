import type { KanbanIssue, KanbanSnapshot } from '../../core/api/services/kanbanApi';

export function shouldApplySnapshotRevision(revision: number, lastAppliedRevision: number): boolean {
  return revision === 0 || revision >= lastAppliedRevision;
}

export function nextAppliedSnapshotRevision(current: number, revision: number): number {
  return revision > 0 ? Math.max(current, revision) : current;
}

export function nextIssueIdSet(current: ReadonlySet<string>, issueId: string, included: boolean): Set<string> | null {
  if (current.has(issueId) === included) {
    return null;
  }
  const next = new Set(current);
  if (included) {
    next.add(issueId);
  } else {
    next.delete(issueId);
  }
  return next;
}

export function issueHasRunRecord(issue: KanbanIssue): boolean {
  const chatId = String(issue.chatId || '').trim();
  const runId = String(issue.runId || '').trim();
  return issue.runState === 'running' || (chatId.length > 0 && runId.length > 0);
}

export function reconcileStartedRunIssueIds(
  issueIds: ReadonlySet<string>,
  snapshot: KanbanSnapshot | null
): Set<string> | null {
  if (issueIds.size <= 0 || !snapshot) {
    return null;
  }
  let next: Set<string> | null = null;
  for (const issue of snapshot.issues) {
    if (!issueIds.has(issue.id) || !issueHasRunRecord(issue)) {
      continue;
    }
    if (!next) {
      next = new Set(issueIds);
    }
    next.delete(issue.id);
  }
  return next && next.size !== issueIds.size ? next : null;
}
