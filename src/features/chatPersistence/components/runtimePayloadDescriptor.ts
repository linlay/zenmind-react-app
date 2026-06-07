import type { AppIconUsage } from '../../../shared/icons/AppIcon';
import type {
  ChatTimelineNode,
  ChatTimelineRunNode,
  ChatTimelineToolGroupDisplayItem,
  ChatTimelineToolNode,
} from '../../chatTimeline/index.ts';

export type RuntimePayloadRendererType =
  | 'markdown'
  | 'tool'
  | 'awaiting'
  | 'record'
  | 'plain'
  | 'metric';

export type RuntimePayloadTone = 'reasoning' | 'tool' | 'file' | 'neutral';

export type RuntimeStatusTone = 'active' | 'complete' | 'error' | 'cancelled' | 'idle';

export type RuntimePayloadSectionMode = 'markdown' | 'plain' | 'code';

export type RuntimePayloadSource = ChatTimelineNode | ChatTimelineToolGroupDisplayItem;

export type RuntimePayloadKind = Exclude<ChatTimelineNode['kind'], 'message'> | 'tool-group';

export type RuntimeToolStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'success'
  | 'failed'
  | 'error'
  | 'canceled';

export type RuntimeToolArgumentRow = {
  key: string;
  valueText: string;
};

export type RuntimePayloadSection = {
  id: string;
  label: string;
  text: string;
  mode: RuntimePayloadSectionMode;
};

export type RuntimeToolRecord = {
  key: string;
  title: string;
  status: RuntimeToolStatus;
  statusLabel: string;
  hasDetails: boolean;
  description: string;
  argsText: string;
  argsInlineText: string;
  argsRows: RuntimeToolArgumentRow[];
  resultText: string;
};

export type RuntimePayloadDescriptor = {
  id: string;
  kind: RuntimePayloadKind;
  title: string;
  status: string;
  statusTone: RuntimeStatusTone;
  iconUsage: AppIconUsage;
  tone: RuntimePayloadTone;
  renderer: RuntimePayloadRendererType;
  defaultExpanded: boolean;
  defaultWrap: boolean;
  canExpand: boolean;
  copyText: string;
  sections: RuntimePayloadSection[];
  toolRecords: RuntimeToolRecord[];
};

function compactJoin(values: readonly (string | null | undefined)[], separator = '\n'): string {
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(separator);
}

function formatDurationMs(value: number | null | undefined): string {
  if (!Number.isFinite(value) || Number(value) < 0) {
    return '';
  }
  const duration = Number(value);
  if (duration < 1000) {
    return `${Math.round(duration)}ms`;
  }
  if (duration < 60_000) {
    return `${(duration / 1000).toFixed(duration >= 10_000 ? 0 : 1)}s`;
  }
  const totalSeconds = Math.round(duration / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatRunBody(node: ChatTimelineRunNode): string {
  const duration = formatDurationMs(node.durationMs);
  return compactJoin([node.body, duration ? `耗时 ${duration}` : '']);
}

function isToolGroupSource(
  source: RuntimePayloadSource
): source is ChatTimelineToolGroupDisplayItem {
  return source.kind === 'tool-group';
}

function resolveToolLabel(
  source: Pick<ChatTimelineToolNode | ChatTimelineToolGroupDisplayItem, 'toolLabel' | 'toolName'>
): string {
  return (
    String(source.toolLabel || '').trim() || String(source.toolName || '').trim() || '工具调用'
  );
}

function titleForNode(node: ChatTimelineNode): string {
  if (node.kind === 'awaiting') {
    return node.mode === 'approval'
      ? '等待审批'
      : node.mode === 'form'
        ? '等待表单'
        : node.mode === 'plan'
          ? '等待计划确认'
          : '向用户提问';
  }
  if (node.kind === 'tool') {
    return resolveToolLabel(node) || node.title;
  }
  if (node.kind === 'run') {
    return node.title;
  }
  if ('title' in node) {
    return node.title;
  }
  return node.kind;
}

export function formatToolPillTitle(
  source: ChatTimelineToolNode | ChatTimelineToolGroupDisplayItem
): string {
  return resolveToolLabel(source);
}

function statusForNode(node: ChatTimelineNode): string {
  if (node.kind === 'awaiting') {
    return node.status === 'answer' ? '已回答' : '等待响应';
  }
  if (node.kind === 'run') {
    return node.status;
  }
  if ('status' in node) {
    return node.status;
  }
  return '';
}

function statusToneForNode(node: ChatTimelineNode, status: string): RuntimeStatusTone {
  const normalized = status.toLowerCase();
  if (
    node.lifecycle === 'error' ||
    normalized.includes('error') ||
    normalized.includes('failed') ||
    normalized.includes('失败')
  ) {
    return 'error';
  }
  if (node.lifecycle === 'cancelled') {
    return 'cancelled';
  }
  if (
    node.lifecycle === 'active' ||
    normalized.includes('running') ||
    normalized.includes('active')
  ) {
    return 'active';
  }
  if (
    node.lifecycle === 'complete' ||
    normalized.includes('complete') ||
    normalized.includes('done')
  ) {
    return 'complete';
  }
  return 'idle';
}

function statusToneForToolStatus(status: RuntimeToolStatus): RuntimeStatusTone {
  if (status === 'running') {
    return 'active';
  }
  if (status === 'success' || status === 'completed') {
    return 'complete';
  }
  if (status === 'error' || status === 'failed') {
    return 'error';
  }
  if (status === 'canceled') {
    return 'cancelled';
  }
  return 'idle';
}

function resolveToolStatus(node: ChatTimelineToolNode): RuntimeToolStatus {
  const normalized = String(node.status || '').toLowerCase();
  if (
    node.lifecycle === 'error' ||
    normalized.includes('error') ||
    normalized.includes('failed') ||
    normalized.includes('失败')
  ) {
    return 'error';
  }
  if (node.lifecycle === 'cancelled' || normalized.includes('cancel')) {
    return 'canceled';
  }
  if (node.lifecycle === 'active' || node.streaming || normalized.includes('running')) {
    return 'running';
  }
  if (node.lifecycle === 'complete') {
    return node.resultText.trim() ? 'success' : 'completed';
  }
  return 'pending';
}

function resolveToolStatusLabel(status: RuntimeToolStatus): string {
  switch (status) {
    case 'running':
      return '运行中';
    case 'completed':
      return '等待结果';
    case 'success':
      return '完成';
    case 'failed':
    case 'error':
      return '失败';
    case 'canceled':
      return '已取消';
    default:
      return '等待中';
  }
}

function sectionCopyText(sections: readonly RuntimePayloadSection[]): string {
  return sections
    .filter((section) => section.text)
    .map((section) => (section.label ? `${section.label}\n${section.text}` : section.text))
    .join('\n\n');
}

function singleSection(
  text: string,
  mode: RuntimePayloadSectionMode = 'plain'
): RuntimePayloadSection[] {
  return text ? [{ id: 'body', label: '', text, mode }] : [];
}

function awaitingSections(
  node: Extract<ChatTimelineNode, { kind: 'awaiting' }>
): RuntimePayloadSection[] {
  const sections: RuntimePayloadSection[] = [];
  if (node.prompt) {
    sections.push({ id: 'prompt', label: '问题', text: node.prompt, mode: 'plain' });
  }
  if (node.payloadText) {
    sections.push({
      id: 'payload',
      label: node.mode === 'plan' ? '计划选项' : '内容',
      text: node.payloadText,
      mode: 'plain',
    });
  }
  if (node.answer) {
    sections.push({ id: 'answer', label: '回答', text: node.answer, mode: 'plain' });
  }
  return sections;
}

function toolSections(node: ChatTimelineToolNode): RuntimePayloadSection[] {
  const sections: RuntimePayloadSection[] = [];
  const argsText = formatStructuredTextInline(node.argsText);
  const resultText = formatStructuredTextInline(node.resultText);
  if (argsText) {
    sections.push({ id: 'args', label: '参数', text: argsText, mode: 'code' });
  }
  if (resultText) {
    sections.push({ id: 'result', label: '结果', text: resultText, mode: 'code' });
  }
  return sections;
}

type JsonParseResult = { ok: true; value: unknown } | { ok: false };

function tryParseJsonText(trimmed: string): JsonParseResult {
  if (!trimmed) {
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatInlineValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }

  try {
    return JSON.stringify(value) || String(value);
  } catch {
    return String(value);
  }
}

function formatJsonDocumentInline(value: unknown): string {
  try {
    return JSON.stringify(value) || String(value);
  } catch {
    return String(value);
  }
}

function formatStructuredTextInline(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  const parsed = tryParseJsonText(trimmed);
  if (parsed.ok) {
    return formatJsonDocumentInline(parsed.value);
  }

  return trimmed.replace(/\s+/g, ' ');
}

export function formatToolArgumentsInline(argsText: string): string {
  return formatStructuredTextInline(argsText);
}

function buildToolArgumentRows(argsText: string): RuntimeToolArgumentRow[] {
  const trimmed = argsText.trim();
  const parsed = tryParseJsonText(trimmed);
  if (!parsed.ok || !isRecordValue(parsed.value)) {
    return [];
  }

  return Object.entries(parsed.value).map(([key, value]) => ({
    key,
    valueText: formatInlineValue(value),
  }));
}

function formatToolResultText(resultText: string): string {
  const inlineText = formatStructuredTextInline(resultText);
  return inlineText || '(no output)';
}

export function buildToolPillRecords(
  source: ChatTimelineToolNode | ChatTimelineToolGroupDisplayItem
): RuntimeToolRecord[] {
  const nodes = isToolGroupSource(source) ? source.nodes : [source];

  return nodes.map((node, index) => {
    const argsText = node.argsText || '';
    const resultText = node.resultText || '';
    const status = resolveToolStatus(node);
    const hasDetails = Boolean(argsText.trim()) || Boolean(resultText.trim());
    const argsInlineText = formatToolArgumentsInline(argsText);
    const argsRows = buildToolArgumentRows(argsText);
    const resultDisplayText = resultText.trim() ? formatToolResultText(resultText) : '';

    return {
      key: node.id,
      title: `第 ${index + 1} 次`,
      status,
      statusLabel: resolveToolStatusLabel(status),
      hasDetails,
      description: hasDetails ? node.description || '' : '',
      argsText,
      argsInlineText,
      argsRows,
      resultText: resultDisplayText,
    };
  });
}

export function getExpandableToolPillRecords(
  records: readonly RuntimeToolRecord[]
): RuntimeToolRecord[] {
  return records.filter((record) => record.hasDetails);
}

function iconForKind(kind: RuntimePayloadKind): {
  iconUsage: AppIconUsage;
  tone: RuntimePayloadTone;
} {
  if (kind === 'reasoning') {
    return { iconUsage: 'runtime.reasoning', tone: 'reasoning' };
  }
  if (kind === 'awaiting') {
    return { iconUsage: 'runtime.awaiting', tone: 'reasoning' };
  }
  if (kind === 'tool' || kind === 'tool-group' || kind === 'action') {
    return { iconUsage: 'runtime.tool', tone: 'tool' };
  }
  if (kind === 'artifact' || kind === 'plan' || kind === 'task' || kind === 'planning') {
    return { iconUsage: 'runtime.file', tone: 'file' };
  }
  return { iconUsage: 'runtime.neutral', tone: 'neutral' };
}

function rendererForKind(kind: RuntimePayloadKind): RuntimePayloadRendererType {
  if (kind === 'reasoning' || kind === 'planning') {
    return 'markdown';
  }
  if (kind === 'tool' || kind === 'tool-group') {
    return 'tool';
  }
  if (kind === 'awaiting') {
    return 'awaiting';
  }
  if (kind === 'usage') {
    return 'metric';
  }
  if (
    kind === 'artifact' ||
    kind === 'action' ||
    kind === 'plan' ||
    kind === 'task' ||
    kind === 'context'
  ) {
    return 'record';
  }
  return 'plain';
}

function defaultExpandedForKind(kind: RuntimePayloadKind): boolean {
  return kind === 'awaiting' || kind === 'run' || kind === 'usage' || kind === 'request';
}

export function buildRuntimePayloadDescriptor(
  source: RuntimePayloadSource
): RuntimePayloadDescriptor {
  if (isToolGroupSource(source)) {
    const records = buildToolPillRecords(source);
    const latestRecord = records[records.length - 1];
    const icon = iconForKind(source.kind);
    const canExpand = getExpandableToolPillRecords(records).length > 0;

    return {
      id: source.key,
      kind: source.kind,
      title: formatToolPillTitle(source),
      status: latestRecord?.statusLabel || '',
      statusTone: latestRecord ? statusToneForToolStatus(latestRecord.status) : 'idle',
      iconUsage: icon.iconUsage,
      tone: icon.tone,
      renderer: 'tool',
      defaultExpanded: false,
      defaultWrap: false,
      canExpand,
      copyText: '',
      sections: [],
      toolRecords: records,
    };
  }

  if (source.kind === 'message') {
    return {
      id: source.id,
      kind: 'request',
      title: '消息',
      status: '',
      statusTone: 'idle',
      iconUsage: 'runtime.neutral',
      tone: 'neutral',
      renderer: 'plain',
      defaultExpanded: true,
      defaultWrap: false,
      canExpand: Boolean(source.content.trim()),
      copyText: source.content,
      sections: singleSection(source.content),
      toolRecords: [],
    };
  }

  const kind = source.kind;
  const status = statusForNode(source);
  const icon = iconForKind(kind);
  const renderer = rendererForKind(kind);
  const toolRecords = kind === 'tool' ? buildToolPillRecords(source) : [];
  const sections =
    kind === 'tool'
      ? toolSections(source)
      : kind === 'awaiting'
        ? awaitingSections(source)
        : singleSection(
            kind === 'run' ? formatRunBody(source) : source.body,
            renderer === 'markdown' ? 'markdown' : renderer === 'record' ? 'code' : 'plain'
          );
  const canExpand =
    kind === 'tool' ? getExpandableToolPillRecords(toolRecords).length > 0 : sections.length > 0;
  const latestToolRecord = toolRecords[toolRecords.length - 1];

  return {
    id: source.id,
    kind,
    title: titleForNode(source),
    status: latestToolRecord?.statusLabel || status,
    statusTone: latestToolRecord
      ? statusToneForToolStatus(latestToolRecord.status)
      : statusToneForNode(source, status),
    iconUsage: icon.iconUsage,
    tone: icon.tone,
    renderer,
    defaultExpanded: defaultExpandedForKind(kind),
    defaultWrap: false,
    canExpand,
    copyText: sectionCopyText(sections),
    sections,
    toolRecords,
  };
}
