import type { KanbanIssue } from '../../core/api/services/kanbanApi';

function cleanText(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function buildKanbanAssistantPrompt(issue: KanbanIssue): string {
  const lines = ['Please work on this mobile Kanban task.', `Title: ${cleanText(issue.title) || 'Untitled task'}`];
  const description = cleanText(issue.description);
  if (description) {
    lines.push(`Description: ${description}`);
  }
  if (issue.priority) {
    lines.push(`Priority: ${issue.priority}`);
  }
  const severity = cleanText(issue.severity);
  if (severity) {
    lines.push(`Severity: ${severity}`);
  }
  lines.push(
    'Expected result: make progress in this chat, summarize the result, and leave it ready for mobile review.'
  );
  return lines.join('\n');
}
