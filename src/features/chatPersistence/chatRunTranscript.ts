import { getChatTimelineMessageTextSource } from './chatTimelineTextSearch.ts';
import { getChatTimelineRun } from '../chatTimeline/timelineRunAccess.ts';
import { buildChatTimelineDisplayModel } from '../chatTimeline/timelineDisplay.ts';
import type { ChatTimelineState, ChatTimelineDisplayItem } from '../chatTimeline/types.ts';
import { sanitizeRuntimeStructuredPayloadForCopy } from './components/runtimeStructuredPayload.ts';

/** Build only on an explicit copy action; never serialize the timeline or transient tool output. */
export function serializeChatRunTranscript(
  state: ChatTimelineState,
  runId: string,
  displayItems: readonly ChatTimelineDisplayItem[] = buildChatTimelineDisplayModel(state).items
): string {
  if (!runId) return '';
  const query: string[] = [],
    thinking: string[] = [],
    tools: string[] = [],
    answer: string[] = [],
    errors: string[] = [];
  const text = (value: string) => sanitizeRuntimeStructuredPayloadForCopy(value);
  let toolCount = 0;
  const tool = (node: import('../chatTimeline/types.ts').ChatTimelineToolNode) => {
    const lines = [`${++toolCount}. ${text(node.toolLabel || node.toolName || node.title || 'Tool')}`];
    if (node.description) lines.push(`description: ${text(node.description)}`);
    if (node.argsText) lines.push(`arguments:\n${text(node.argsText)}`);
    if (node.resultText) lines.push(`result:\n${text(node.resultText)}`);
    if (node.lifecycle === 'error' || node.lifecycle === 'cancelled' || node.lifecycle === 'active')
      lines.push(`status: ${node.lifecycle}`);
    tools.push(lines.join('\n'));
  };
  for (const item of displayItems) {
    if (item.runId !== runId || item.kind === 'assistant-reply-footer') continue;
    if (item.kind === 'tool-group') {
      item.nodes.forEach(tool);
      continue;
    }
    const node = item.node;
    if (node.kind === 'message') {
      if (node.role === 'user')
        query.push(text(node.messageVariant === 'default' ? node.content : `[${node.messageVariant}] ${node.content}`));
      else if (node.role === 'assistant') answer.push(text(getChatTimelineMessageTextSource(node)));
      else if (node.lifecycle === 'error') errors.push(text(node.content));
    } else if (node.kind === 'reasoning' || node.kind === 'planning') thinking.push(text(node.body));
    else if (node.kind === 'tool') tool(node);
  }
  const sections: string[] = [];
  for (const [title, values] of [
    ['Query', query],
    ['Thinking', thinking],
    ['Tools', tools],
    ['Answer', answer]
  ] as const) {
    const body = values.filter((value) => value.trim()).join('\n\n');
    if (body) sections.push(`${title}\n${body}`);
  }
  const run = getChatTimelineRun(state, runId);
  if (errors.length || (run && (run.lifecycle !== 'complete' || run.completedAt === null)))
    sections.push(
      `Status\n${run?.completedAt === null ? 'partial' : run?.lifecycle || 'error'}${errors.length ? '\n' + errors.join('\n') : ''}`
    );
  return sections.join('\n\n');
}
