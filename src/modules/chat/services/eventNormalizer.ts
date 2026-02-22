import { PlanTask } from '../types/chat';

export const FRONTEND_VIEWPORT_TYPES = new Set(['html', 'qlc']);

export function normalizeTaskStatus(raw: unknown): PlanTask['status'] {
  const status = String(raw || 'init').toLowerCase();
  if (status === 'running' || status === 'in_progress' || status === 'progress') return 'running';
  if (status === 'done' || status === 'completed' || status === 'success' || status === 'finished') return 'done';
  if (status === 'failed' || status === 'error') return 'failed';
  return 'init';
}

export function normalizePlanTask(task: Record<string, unknown>, index: number): PlanTask {
  const taskId = String(task?.taskId || `task-${index + 1}`);
  const description = String(task?.description || taskId || '未命名任务');
  const status = normalizeTaskStatus(task?.status);
  return { taskId, description, status };
}

export function getTaskTone(status: unknown): 'ok' | 'warn' | 'danger' | 'neutral' {
  const normalized = normalizeTaskStatus(status);
  if (normalized === 'done') return 'ok';
  if (normalized === 'failed') return 'danger';
  if (normalized === 'running') return 'warn';
  return 'neutral';
}

export function renderToolLabel(event: Record<string, unknown>): string {
  const toolName = String(event.toolName || '').trim();
  if (toolName) return toolName;

  const toolApi = String(event.toolApi || '').trim();
  if (toolApi) return toolApi;

  const toolKey = String(event.toolKey || '').trim();
  if (toolKey) return toolKey;

  return 'tool';
}

export function renderActionLabel(event: Record<string, unknown>): string {
  const name = String(event.actionName || '').trim();
  if (name) return name;

  const description = String(event.description || '').trim();
  if (description) return description;

  const actionId = String(event.actionId || '').trim();
  if (actionId) return actionId;

  return 'action';
}

export function getActionGlyph(actionName: unknown): string {
  const name = String(actionName || '').trim().toLowerCase();
  if (name === 'switch_theme') return '◐';
  if (name === 'launch_fireworks') return '✦';
  if (name === 'show_modal') return '▣';
  return '✧';
}

export function normalizeEventType(rawType: unknown): string {
  const type = String(rawType || '').trim();
  if (!type) return '';

  const aliasMap: Record<string, string> = {
    'message.start': 'content.start',
    'message.delta': 'content.delta',
    'message.end': 'content.end',
    'answer.start': 'content.start',
    'answer.delta': 'content.delta',
    'answer.end': 'content.end',
    'response.start': 'content.start',
    'response.delta': 'content.delta',
    'response.end': 'content.end'
  };

  return aliasMap[type] || type;
}

export function isStreamActivityType(type: string): boolean {
  if (!type) return false;
  if (type === 'run.start' || type === 'plan.update') return true;

  return (
    type.startsWith('content.') ||
    type.startsWith('tool.') ||
    type.startsWith('action.') ||
    type.startsWith('reasoning.') ||
    type.startsWith('task.')
  );
}

export function parseStructuredArgs(rawText: unknown): Record<string, unknown> | null {
  const text = String(rawText || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function isFrontendToolEvent(event: Record<string, unknown>): boolean {
  if (!event || typeof event !== 'object') return false;
  const toolType = String(event.toolType || '').trim().toLowerCase();
  return FRONTEND_VIEWPORT_TYPES.has(toolType) && Boolean(event.toolKey);
}

export function getPlanProgress(tasks: PlanTask[] = []): { current: number; total: number } {
  const total = tasks.length;
  if (!total) return { current: 0, total: 0 };

  const runningIndex = tasks.findIndex((task) => normalizeTaskStatus(task.status) === 'running');
  if (runningIndex >= 0) {
    return { current: runningIndex + 1, total };
  }

  for (let i = total - 1; i >= 0; i -= 1) {
    const status = normalizeTaskStatus(tasks[i].status);
    if (status === 'done' || status === 'failed') {
      return { current: i + 1, total };
    }
  }

  return { current: 1, total };
}
