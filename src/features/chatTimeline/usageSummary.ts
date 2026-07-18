import type {
  ChatTimelineUsageContextWindow,
  ChatTimelineUsageEstimatedCost,
  ChatTimelineUsageStats,
  ChatTimelineUsageSummary,
} from './types.ts';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
  return String(value || '').trim();
}

function readUsageNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function firstUsageNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numberValue = readUsageNumber(value);
    if (numberValue !== null) {
      return numberValue;
    }
  }
  return null;
}

function readRecordField(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return isObjectRecord(value) ? value : {};
}

function readOptionalRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = record[key];
  return isObjectRecord(value) ? value : null;
}

function firstUsageRecord(
  ...records: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  return records.find((record): record is Record<string, unknown> => Boolean(record)) ?? {};
}

function firstUsageText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value);
    if (text) {
      return text;
    }
  }
  return '';
}

export function resolveChatTimelineUsageModelKey(value: unknown): string {
  if (!isObjectRecord(value)) {
    return '';
  }

  const contextWindow = value.contextWindow;
  if (isObjectRecord(contextWindow)) {
    const key = toText(contextWindow.modelKey) || toText(contextWindow.model_key);
    if (key) {
      return key;
    }
  }

  const model = value.model;
  if (isObjectRecord(model)) {
    const key = toText(model.key) || toText(model.modelKey) || toText(model.model_key);
    if (key) {
      return key;
    }
  }
  if (typeof model === 'string') {
    const key = model.trim();
    if (key) {
      return key;
    }
  }

  return toText(value.modelKey) || toText(value.model_key);
}

function hasRecordUsageNumber(record: Record<string, unknown>, key: string): boolean {
  return readUsageNumber(record[key]) !== null;
}

function hasUsageTokenDetailsValue(record: Record<string, unknown>): boolean {
  return (
    hasRecordUsageNumber(record, 'cacheHitTokens') ||
    hasRecordUsageNumber(record, 'cacheMissTokens') ||
    hasRecordUsageNumber(record, 'reasoningTokens')
  );
}

function hasEstimatedCostValue(cost: ChatTimelineUsageEstimatedCost | null): boolean {
  return Boolean(
    cost &&
    (cost.inputCacheHit !== null ||
      cost.inputCacheMiss !== null ||
      cost.output !== null ||
      cost.total !== null)
  );
}

function hasStatsValue(stats: ChatTimelineUsageStats): boolean {
  return (
    stats.promptTokens !== null ||
    stats.completionTokens !== null ||
    stats.totalTokens !== null ||
    stats.reasoningTokens !== null ||
    stats.cacheHitTokens !== null ||
    stats.cacheMissTokens !== null ||
    stats.llmChatCompletionCount !== null ||
    stats.toolCallCount !== null ||
    hasEstimatedCostValue(stats.estimatedCost)
  );
}

function hasUsageStatsRecordValue(record: Record<string, unknown>): boolean {
  const promptDetails = readRecordField(record, 'promptTokensDetails');
  const completionDetails = readRecordField(record, 'completionTokensDetails');
  const estimatedCost = readRecordField(record, 'estimatedCost');

  return (
    hasRecordUsageNumber(record, 'promptTokens') ||
    hasRecordUsageNumber(record, 'inputTokens') ||
    hasRecordUsageNumber(record, 'completionTokens') ||
    hasRecordUsageNumber(record, 'outputTokens') ||
    hasRecordUsageNumber(record, 'totalTokens') ||
    hasRecordUsageNumber(record, 'reasoningTokens') ||
    hasRecordUsageNumber(record, 'cacheHitTokens') ||
    hasRecordUsageNumber(record, 'cacheMissTokens') ||
    hasRecordUsageNumber(record, 'llmChatCompletionCount') ||
    hasRecordUsageNumber(record, 'toolCallCount') ||
    hasRecordUsageNumber(record, 'estimatedCostTotal') ||
    hasUsageTokenDetailsValue(promptDetails) ||
    hasUsageTokenDetailsValue(completionDetails) ||
    hasRecordUsageNumber(estimatedCost, 'total')
  );
}

function buildEstimatedCost(
  source: Record<string, unknown>,
  fallback: Record<string, unknown> = {}
): ChatTimelineUsageEstimatedCost | null {
  const cost = readRecordField(source, 'estimatedCost');
  const fallbackCost = readRecordField(fallback, 'estimatedCost');
  const estimatedCost: ChatTimelineUsageEstimatedCost = {
    currency: firstUsageText(cost.currency, fallbackCost.currency, source.estimatedCostCurrency),
    inputCacheHit: firstUsageNumber(cost.inputCacheHit, fallbackCost.inputCacheHit),
    inputCacheMiss: firstUsageNumber(cost.inputCacheMiss, fallbackCost.inputCacheMiss),
    output: firstUsageNumber(cost.output, fallbackCost.output),
    total: firstUsageNumber(
      cost.total,
      fallbackCost.total,
      source.estimatedCostTotal,
      fallback.estimatedCostTotal
    ),
  };

  return hasEstimatedCostValue(estimatedCost) ? estimatedCost : null;
}

function buildUsageStats(
  source: Record<string, unknown>,
  fallback: Record<string, unknown> = {}
): ChatTimelineUsageStats {
  const promptDetails = firstUsageRecord(
    readOptionalRecord(source, 'promptTokensDetails'),
    readOptionalRecord(fallback, 'promptTokensDetails')
  );
  const completionDetails = firstUsageRecord(
    readOptionalRecord(source, 'completionTokensDetails'),
    readOptionalRecord(fallback, 'completionTokensDetails')
  );
  const promptTokens = firstUsageNumber(
    source.promptTokens,
    source.inputTokens,
    fallback.promptTokens,
    fallback.inputTokens
  );
  const completionTokens = firstUsageNumber(
    source.completionTokens,
    source.outputTokens,
    fallback.completionTokens,
    fallback.outputTokens
  );
  const totalTokens =
    firstUsageNumber(source.totalTokens, fallback.totalTokens) ??
    (promptTokens !== null || completionTokens !== null
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : null);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens: firstUsageNumber(
      completionDetails.reasoningTokens,
      source.reasoningTokens,
      fallback.reasoningTokens
    ),
    cacheHitTokens: firstUsageNumber(
      promptDetails.cacheHitTokens,
      source.cacheHitTokens,
      fallback.cacheHitTokens
    ),
    cacheMissTokens: firstUsageNumber(
      promptDetails.cacheMissTokens,
      source.cacheMissTokens,
      fallback.cacheMissTokens
    ),
    llmChatCompletionCount: firstUsageNumber(
      source.llmChatCompletionCount,
      fallback.llmChatCompletionCount
    ),
    toolCallCount: firstUsageNumber(source.toolCallCount, fallback.toolCallCount),
    estimatedCost: buildEstimatedCost(source, fallback),
  };
}

function buildContextWindow(source: Record<string, unknown>): ChatTimelineUsageContextWindow {
  const currentSize = firstUsageNumber(source.currentSize);
  const maxSize = firstUsageNumber(source.maxSize);
  const estimatedNextCallSize = firstUsageNumber(source.estimatedNextCallSize);
  const percent =
    currentSize !== null && maxSize !== null && maxSize > 0
      ? Math.max(0, Math.min(100, Math.round((currentSize / maxSize) * 100)))
      : null;

  return {
    currentSize,
    maxSize,
    estimatedNextCallSize,
    percent,
    reasoningEffort: firstUsageText(source.reasoningEffort, source.reasoning_effort),
  };
}

export function buildChatTimelineUsageSummary(
  event: Record<string, unknown>,
  updatedAt: number
): ChatTimelineUsageSummary {
  const usage = isObjectRecord(event.usage) ? event.usage : {};
  const hasNestedUsage = Boolean(
    readOptionalRecord(usage, 'current') ||
    readOptionalRecord(usage, 'run') ||
    readOptionalRecord(usage, 'lastRun') ||
    readOptionalRecord(usage, 'chat') ||
    readOptionalRecord(usage, 'compact') ||
    readOptionalRecord(usage, 'compactionUsage')
  );
  const flatUsageRecord = hasUsageStatsRecordValue(usage) ? usage : event;
  const currentRecord =
    readOptionalRecord(usage, 'current') ?? (hasNestedUsage ? {} : flatUsageRecord);
  const runRecord = readOptionalRecord(usage, 'run') ?? readOptionalRecord(usage, 'lastRun') ?? {};
  const chatRecord = readOptionalRecord(usage, 'chat') ?? (hasNestedUsage ? {} : flatUsageRecord);
  const compactRecord =
    readOptionalRecord(usage, 'compact') ??
    readOptionalRecord(usage, 'compactionUsage') ??
    readOptionalRecord(event, 'compactionUsage') ??
    readOptionalRecord(event, 'compactUsage') ??
    null;
  const contextWindow =
    (isObjectRecord(event.contextWindow) ? event.contextWindow : null) ??
    readOptionalRecord(usage, 'contextWindow') ??
    {};
  const current = buildUsageStats(currentRecord, event);
  const run = buildUsageStats(runRecord);
  const chat = buildUsageStats(chatRecord);
  const compact = compactRecord ? buildUsageStats(compactRecord) : null;
  const modelKey =
    resolveChatTimelineUsageModelKey(event) ||
    resolveChatTimelineUsageModelKey(usage) ||
    resolveChatTimelineUsageModelKey(currentRecord) ||
    resolveChatTimelineUsageModelKey(runRecord) ||
    resolveChatTimelineUsageModelKey(chatRecord);

  return {
    label: firstUsageText(
      event.usageLabel,
      event.usage_label,
      usage.usageLabel,
      usage.usage_label,
      usage.label,
      event.label
    ),
    modelKey,
    contextWindow: buildContextWindow(contextWindow),
    current,
    run,
    chat,
    compact: compact && hasStatsValue(compact) ? compact : null,
    updatedAt,
  };
}

export function mergeChatTimelineUsageSummaryForContextCompact(
  current: ChatTimelineUsageSummary | null,
  event: Record<string, unknown>,
  updatedAt: number
): ChatTimelineUsageSummary | null {
  const payload = isObjectRecord(event.payload) ? event.payload : {};
  const postCompactTokens = firstUsageNumber(
    event.postCompactEstimatedTokens,
    event.postCompactTokens,
    event.afterTokens,
    payload.postCompactEstimatedTokens,
    payload.postCompactTokens,
    payload.afterTokens
  );
  const incoming = buildChatTimelineUsageSummary(event, updatedAt);
  const compact = incoming.compact ?? current?.compact ?? null;
  if (!current && postCompactTokens === null && !compact) {
    return null;
  }

  const contextWindow = current?.contextWindow ?? incoming.contextWindow;
  return {
    label: current?.label || incoming.label,
    modelKey: current?.modelKey || incoming.modelKey,
    contextWindow:
      postCompactTokens === null
        ? contextWindow
        : {
            ...contextWindow,
            currentSize: postCompactTokens,
            estimatedNextCallSize: postCompactTokens,
            percent:
              contextWindow.maxSize !== null && contextWindow.maxSize > 0
                ? Math.max(
                    0,
                    Math.min(100, Math.round((postCompactTokens / contextWindow.maxSize) * 100))
                  )
                : null,
          },
    current: current?.current ?? incoming.current,
    run: current?.run ?? incoming.run,
    chat: current?.chat ?? incoming.chat,
    compact,
    updatedAt,
  };
}

function estimatedCostEqual(
  left: ChatTimelineUsageEstimatedCost | null,
  right: ChatTimelineUsageEstimatedCost | null
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.currency === right.currency &&
    left.inputCacheHit === right.inputCacheHit &&
    left.inputCacheMiss === right.inputCacheMiss &&
    left.output === right.output &&
    left.total === right.total
  );
}

function usageStatsEqual(left: ChatTimelineUsageStats, right: ChatTimelineUsageStats): boolean {
  return (
    left.promptTokens === right.promptTokens &&
    left.completionTokens === right.completionTokens &&
    left.totalTokens === right.totalTokens &&
    left.reasoningTokens === right.reasoningTokens &&
    left.cacheHitTokens === right.cacheHitTokens &&
    left.cacheMissTokens === right.cacheMissTokens &&
    left.llmChatCompletionCount === right.llmChatCompletionCount &&
    left.toolCallCount === right.toolCallCount &&
    estimatedCostEqual(left.estimatedCost ?? null, right.estimatedCost ?? null)
  );
}

function optionalUsageStatsEqual(
  left: ChatTimelineUsageStats | null | undefined,
  right: ChatTimelineUsageStats | null | undefined
): boolean {
  if (!left || !right) {
    return !left && !right;
  }
  return usageStatsEqual(left, right);
}

function contextWindowEqual(
  left: ChatTimelineUsageContextWindow,
  right: ChatTimelineUsageContextWindow
): boolean {
  return (
    left.currentSize === right.currentSize &&
    left.maxSize === right.maxSize &&
    left.estimatedNextCallSize === right.estimatedNextCallSize &&
    left.percent === right.percent &&
    left.reasoningEffort === right.reasoningEffort
  );
}

export function chatTimelineUsageSummaryEquals(
  left: ChatTimelineUsageSummary | null,
  right: ChatTimelineUsageSummary | null
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.label === right.label &&
    left.modelKey === right.modelKey &&
    left.updatedAt === right.updatedAt &&
    contextWindowEqual(left.contextWindow, right.contextWindow) &&
    usageStatsEqual(left.current, right.current) &&
    usageStatsEqual(left.run, right.run) &&
    usageStatsEqual(left.chat, right.chat) &&
    optionalUsageStatsEqual(left.compact, right.compact)
  );
}
