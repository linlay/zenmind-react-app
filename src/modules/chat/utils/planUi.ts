import { PlanTask } from '../types/chat';

const STATUS_PREFIX_RE = /^\s*\[(?:completed|done|running|failed|success|init|todo|pending|in[_\s-]?progress)\]\s*/i;
const TASK_NAME_PREFIX_RE = /^\s*task[-_\s]?\d+\s*[·:：-]\s*/i;
const ID_PREFIX_RE = /^\s*(?=[a-z0-9_-]*\d)[a-z0-9_-]{4,}\s*[·:：-]\s*/i;

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripKnownPrefix(text: string): string {
  let next = text.trim();
  let changed = true;

  while (changed) {
    const prev = next;
    next = next.replace(STATUS_PREFIX_RE, '').replace(TASK_NAME_PREFIX_RE, '').replace(ID_PREFIX_RE, '').trim();
    changed = prev !== next;
  }

  return next;
}

export function cleanPlanTaskDescription(task: PlanTask): string {
  const raw = String(task?.description || '').trim();
  if (!raw) return '';

  let next = stripKnownPrefix(raw);
  const taskId = String(task?.taskId || '').trim();
  if (taskId) {
    const taskIdPrefix = new RegExp(`^\\s*${escapeRegExp(taskId)}\\s*[·:：-]?\\s*`, 'i');
    next = next.replace(taskIdPrefix, '').trim();
  }
  return stripKnownPrefix(next);
}

export function buildCollapsedPlanText(tasks: PlanTask[] = []): string {
  const total = tasks.length;
  if (!total) return '';

  const runningIndex = tasks.findIndex((task) => task.status === 'running');
  if (runningIndex >= 0) {
    const runningTask = tasks[runningIndex];
    const description = cleanPlanTaskDescription(runningTask) || `任务 ${runningIndex + 1}`;
    const runningLabel = description.startsWith('正在') ? description : `正在${description}`;
    return `${runningIndex + 1}/${total} ${runningLabel}`;
  }

  const lastIndex = total - 1;
  const fallbackDescription = cleanPlanTaskDescription(tasks[lastIndex]) || `任务 ${lastIndex + 1}`;
  return `${lastIndex + 1}/${total} ${fallbackDescription}`;
}
