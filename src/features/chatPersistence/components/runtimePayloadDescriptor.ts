import type { AppIconUsage } from '../../../shared/icons/AppIcon';
import { defaultT, type TFunction } from '../../../shared/i18n/translate.ts';
import type {
  ChatTimelineArtifactNode,
  ChatTimelineNode,
  ChatTimelinePlanNode,
  ChatTimelineRunNode,
  ChatTimelineSourceNode,
  ChatTimelineTaskNode,
  ChatTimelineTextNode,
  ChatTimelineToolGroupDisplayItem,
  ChatTimelineToolNode,
  ChatTimelineUsageStats,
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

export type RuntimePayloadSource =
  | Exclude<
      ChatTimelineNode,
      | ChatTimelineArtifactNode
      | ChatTimelinePlanNode
      | ChatTimelineSourceNode
      | ChatTimelineTaskNode
    >
  | ChatTimelineToolGroupDisplayItem;

export type RuntimePayloadKind =
  | Exclude<ChatTimelineNode['kind'], 'artifact' | 'message' | 'plan' | 'source' | 'task'>
  | 'tool-group';

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
  startedAt: number | null;
  durationText: string;
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

type RuntimeStatusView = {
  code: string;
  label: string;
  tone: RuntimeStatusTone;
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

function formatToolDurationMs(value: number | null | undefined): string {
  if (!Number.isFinite(value) || Number(value) < 1000) {
    return '';
  }
  return formatDurationMs(value);
}

function formatToolDurationText(value: number | null | undefined, t: TFunction): string {
  const duration = formatToolDurationMs(value);
  return duration ? t('runtime.duration', { duration }) : '';
}

function formatRunBody(node: ChatTimelineRunNode, t: TFunction): string {
  const duration = formatDurationMs(node.durationMs);
  return compactJoin([node.body, duration ? t('runtime.duration', { duration }) : '']);
}

function isToolGroupSource(
  source: RuntimePayloadSource
): source is ChatTimelineToolGroupDisplayItem {
  return source.kind === 'tool-group';
}

function resolveToolLabel(
  source: Pick<ChatTimelineToolNode | ChatTimelineToolGroupDisplayItem, 'toolLabel' | 'toolName'>,
  t: TFunction
): string {
  return (
    String(source.toolLabel || '').trim() || String(source.toolName || '').trim() || t('runtime.toolCall')
  );
}

function titleForNode(node: ChatTimelineNode, t: TFunction): string {
  if (node.kind === 'reasoning') {
    if (node.lifecycle === 'active' || node.streaming) {
      return String(node.title || '').trim() || t('runtime.reasoningProcess');
    }
    return t('runtime.reasoningProcess');
  }
  if (node.kind === 'awaiting') {
    return node.mode === 'approval'
      ? t('runtime.awaiting.approval')
      : node.mode === 'form'
        ? t('runtime.awaiting.form')
        : node.mode === 'plan'
          ? t('runtime.awaiting.plan')
          : t('runtime.awaiting.question');
  }
  if (node.kind === 'planning') {
    if (node.lifecycle === 'active' || node.streaming) {
      return t('runtime.planning.writing');
    }
    return t('runtime.planning');
  }
  if (node.kind === 'usage') {
    return t('usage.title');
  }
  if (node.kind === 'tool') {
    return resolveToolLabel(node, t) || node.title;
  }
  if (node.kind === 'run') {
    return String(node.title || '').trim() || t('runtime.runStatus');
  }
  if ('title' in node) {
    return node.title;
  }
  return node.kind;
}

export function formatToolPillTitle(
  source: ChatTimelineToolNode | ChatTimelineToolGroupDisplayItem,
  t: TFunction = defaultT
): string {
  return resolveToolLabel(source, t);
}

function runtimeStatusLabel(status: string, t: TFunction): string {
  switch (status) {
    case 'generating':
      return t('runtime.status.generating');
    case 'updating':
      return t('runtime.status.updating');
    case 'running':
      return t('runtime.status.running');
    case 'completed':
      return t('runtime.status.completed');
    case 'cancelled':
    case 'canceled':
      return t('runtime.status.cancelled');
    case 'error':
      return t('runtime.status.error');
    case 'tool_result':
      return t('runtime.status.toolResult');
    default:
      return '';
  }
}

function statusCodeForNode(node: ChatTimelineNode): string {
  if (node.kind === 'awaiting') {
    return node.status === 'answer' ? 'answered' : 'waiting';
  }
  if ('status' in node) {
    return String(node.status || '').trim();
  }
  return '';
}

function statusLabelForCode(code: string, t: TFunction): string {
  switch (code) {
    case 'answered':
      return t('runtime.awaiting.answered');
    case 'waiting':
      return t('runtime.awaiting.waiting');
    default:
      return runtimeStatusLabel(code, t) || code;
  }
}

function statusToneForCode(node: ChatTimelineNode, code: string): RuntimeStatusTone {
  const normalized = code.toLowerCase();
  if (
    node.lifecycle === 'error' ||
    normalized.includes('error') ||
    normalized.includes('failed')
  ) {
    return 'error';
  }
  if (
    node.lifecycle === 'cancelled' ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled')
  ) {
    return 'cancelled';
  }
  if (
    node.lifecycle === 'active' ||
    normalized.includes('running') ||
    normalized.includes('generating') ||
    normalized.includes('updating') ||
    normalized.includes('active')
  ) {
    return 'active';
  }
  if (
    node.lifecycle === 'complete' ||
    normalized.includes('complete') ||
    normalized.includes('completed') ||
    normalized.includes('tool_result') ||
    normalized.includes('done')
  ) {
    return 'complete';
  }
  return 'idle';
}

function resolveRuntimeStatusView(node: ChatTimelineNode, t: TFunction): RuntimeStatusView {
  const code = statusCodeForNode(node);
  return {
    code,
    label: statusLabelForCode(code, t),
    tone: statusToneForCode(node, code),
  };
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

function resolveToolStatus(node: ChatTimelineToolNode, t: TFunction): RuntimeToolStatus {
  const statusView = resolveRuntimeStatusView(node, t);
  if (statusView.tone === 'error') {
    return 'error';
  }
  if (statusView.tone === 'cancelled') {
    return 'canceled';
  }
  if (statusView.tone === 'active') {
    return 'running';
  }
  if (statusView.tone === 'complete') {
    return node.resultText.trim() ? 'success' : 'completed';
  }
  return 'pending';
}

function resolveToolStatusLabel(status: RuntimeToolStatus, t: TFunction): string {
  switch (status) {
    case 'running':
      return t('runtime.tool.status.running');
    case 'completed':
      return t('runtime.tool.status.completed');
    case 'success':
      return t('runtime.tool.status.success');
    case 'failed':
    case 'error':
      return t('runtime.tool.status.failed');
    case 'canceled':
      return t('runtime.tool.status.canceled');
    default:
      return t('runtime.tool.status.pending');
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
  node: Extract<ChatTimelineNode, { kind: 'awaiting' }>,
  t: TFunction
): RuntimePayloadSection[] {
  const sections: RuntimePayloadSection[] = [];
  if (node.prompt) {
    sections.push({ id: 'prompt', label: t('runtime.section.question'), text: node.prompt, mode: 'plain' });
  }
  if (node.payloadText) {
    sections.push({
      id: 'payload',
      label: node.mode === 'plan' ? t('runtime.section.planOptions') : t('runtime.section.content'),
      text: node.payloadText,
      mode: 'plain',
    });
  }
  if (node.answer) {
    sections.push({ id: 'answer', label: t('runtime.section.answer'), text: node.answer, mode: 'plain' });
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

function normalizePositiveTimestamp(value: unknown): number | null {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function getCompletedToolDurationMs(node: ChatTimelineToolNode, status: RuntimeToolStatus): number | null {
  if (status === 'running' || status === 'pending') {
    return null;
  }

  const startedAt = normalizePositiveTimestamp(node.createdAt);
  const endedAt = normalizePositiveTimestamp(node.updatedAt);
  if (startedAt === null || endedAt === null || endedAt <= startedAt) {
    return null;
  }
  return endedAt - startedAt;
}

export function buildToolPillRecords(
  source: ChatTimelineToolNode | ChatTimelineToolGroupDisplayItem,
  t: TFunction = defaultT
): RuntimeToolRecord[] {
  const nodes = isToolGroupSource(source) ? source.nodes : [source];

  return nodes.map((node, index) => {
    const argsText = node.argsText || '';
    const resultText = node.resultText || '';
    const status = resolveToolStatus(node, t);
    const startedAt = status === 'running' ? normalizePositiveTimestamp(node.createdAt) : null;
    const durationText = formatToolDurationText(getCompletedToolDurationMs(node, status), t);
    const hasPayload = Boolean(argsText.trim()) || Boolean(resultText.trim());
    const hasTiming = Boolean(startedAt) || Boolean(durationText);
    const hasDetails = hasPayload || hasTiming;
    const argsInlineText = formatToolArgumentsInline(argsText);
    const argsRows = buildToolArgumentRows(argsText);
    const resultDisplayText = resultText.trim() ? formatStructuredTextInline(resultText) : '';

    return {
      key: node.id,
      title: t('runtime.toolAttempt', { count: index + 1 }),
      status,
      statusLabel: resolveToolStatusLabel(status, t),
      startedAt,
      durationText,
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

function toolRecordsCopyText(records: readonly RuntimeToolRecord[], t: TFunction): string {
  const includeAttemptTitle = records.length > 1;
  return records
    .map((record) =>
      compactJoin(
        [
          includeAttemptTitle ? record.title : '',
          record.argsInlineText ? `${t('runtime.section.args')}\n${record.argsInlineText}` : '',
          record.resultText ? `${t('runtime.section.result')}\n${record.resultText}` : '',
        ],
        '\n'
      )
    )
    .filter(Boolean)
    .join('\n\n');
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
  if (kind === 'planning') {
    return { iconUsage: 'runtime.planning', tone: 'tool' };
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
  if (kind === 'action' || kind === 'context') {
    return 'record';
  }
  return 'plain';
}

function defaultExpandedForKind(kind: RuntimePayloadKind): boolean {
  return (
    kind === 'awaiting' ||
    kind === 'planning' ||
    kind === 'run' ||
    kind === 'usage' ||
    kind === 'request'
  );
}

function hasUsageStatsValue(stats: ChatTimelineUsageStats | null | undefined): boolean {
  return Boolean(
    stats &&
      (stats.promptTokens !== null ||
        stats.completionTokens !== null ||
        stats.totalTokens !== null)
  );
}

function formatUsageBody(node: ChatTimelineTextNode, t: TFunction): string {
  const summary = node.usageSummary ?? null;
  const stats = hasUsageStatsValue(summary?.current)
    ? summary?.current
    : hasUsageStatsValue(summary?.run)
      ? summary?.run
      : hasUsageStatsValue(summary?.chat)
        ? summary?.chat
        : hasUsageStatsValue(summary?.compact)
          ? summary?.compact
          : null;

  if (!stats) {
    return node.body;
  }

  return compactJoin(
    [
      stats.promptTokens !== null ? `${t('usage.metric.prompt')} ${stats.promptTokens}` : '',
      stats.completionTokens !== null ? `${t('usage.metric.completion')} ${stats.completionTokens}` : '',
      stats.totalTokens !== null ? `${t('usage.metric.total')} ${stats.totalTokens}` : '',
    ],
    ' · '
  );
}

export function buildRuntimePayloadDescriptor(
  source: RuntimePayloadSource,
  t: TFunction = defaultT
): RuntimePayloadDescriptor {
  if (isToolGroupSource(source)) {
    const records = buildToolPillRecords(source, t);
    const latestRecord = records[records.length - 1];
    const icon = iconForKind(source.kind);
    const canExpand = getExpandableToolPillRecords(records).length > 0;

    return {
      id: source.key,
      kind: source.kind,
      title: formatToolPillTitle(source, t),
      status: latestRecord?.statusLabel || '',
      statusTone: latestRecord ? statusToneForToolStatus(latestRecord.status) : 'idle',
      iconUsage: icon.iconUsage,
      tone: icon.tone,
      renderer: 'tool',
      defaultExpanded: false,
      defaultWrap: false,
      canExpand,
      copyText: toolRecordsCopyText(records, t),
      sections: [],
      toolRecords: records,
    };
  }

  if (source.kind === 'message') {
    return {
      id: source.id,
      kind: 'request',
      title: t('runtime.message'),
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
  const statusView = resolveRuntimeStatusView(source, t);
  const icon = iconForKind(kind);
  const renderer = rendererForKind(kind);
  const toolRecords = kind === 'tool' ? buildToolPillRecords(source, t) : [];
  const sections =
    kind === 'tool'
      ? []
      : kind === 'awaiting'
        ? awaitingSections(source, t)
        : singleSection(
            kind === 'run'
              ? formatRunBody(source, t)
              : kind === 'usage'
                ? formatUsageBody(source, t)
                : source.body,
            renderer === 'markdown' ? 'markdown' : renderer === 'record' ? 'code' : 'plain'
          );
  const canExpand =
    kind === 'tool' ? getExpandableToolPillRecords(toolRecords).length > 0 : sections.length > 0;
  const latestToolRecord = toolRecords[toolRecords.length - 1];

  return {
    id: source.id,
    kind,
    title: titleForNode(source, t),
    status: latestToolRecord?.statusLabel || statusView.label,
    statusTone: latestToolRecord ? statusToneForToolStatus(latestToolRecord.status) : statusView.tone,
    iconUsage: icon.iconUsage,
    tone: icon.tone,
    renderer,
    defaultExpanded: defaultExpandedForKind(kind),
    defaultWrap: false,
    canExpand,
    copyText: kind === 'tool' ? toolRecordsCopyText(toolRecords, t) : sectionCopyText(sections),
    sections,
    toolRecords,
  };
}
