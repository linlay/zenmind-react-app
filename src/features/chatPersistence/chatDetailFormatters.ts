import type { AppLocale } from '../../shared/i18n/locales.ts';
import { defaultT, type TFunction } from '../../shared/i18n/translate.ts';
import type { ChatSocketStatus } from '../chatRealtime/types';
import type {
  ChatTimelineUsageEstimatedCost,
  ChatTimelineUsageStats,
} from '../chatTimeline/index.ts';
import type { ChatMessageItem } from './types';

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const MILLISECONDS_PER_SECOND = 1000;
const TENTHS_PER_SECOND = 10;
const DEFAULT_TODAY_LABEL = defaultT('chatDetail.timestamp.today');
const DEFAULT_YESTERDAY_LABEL = defaultT('chatDetail.timestamp.yesterday');

export function formatChatUsageNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : value.toLocaleString();
}

function readUsageTimingNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function resolveChatUsageFirstTokenLatency(stats: ChatTimelineUsageStats | null | undefined): number | null {
  const directLatency = readUsageTimingNumber(stats?.timing.firstTokenLatencyMs);
  if (directLatency !== null) {
    return directLatency;
  }

  const totalLatency = readUsageTimingNumber(stats?.timing.firstTokenLatencyTotalMs);
  const count = readUsageTimingNumber(stats?.timing.firstTokenLatencyCount);
  if (totalLatency === null || totalLatency <= 0 || count === null || count <= 0) {
    return null;
  }
  return totalLatency / count;
}

export function formatChatUsageFirstTokenLatency(
  stats: ChatTimelineUsageStats | null | undefined
): string | null {
  const latencyMs = resolveChatUsageFirstTokenLatency(stats);
  if (latencyMs === null) {
    return null;
  }
  return latencyMs < MILLISECONDS_PER_SECOND
    ? `${Math.round(latencyMs)}ms`
    : `${(latencyMs / MILLISECONDS_PER_SECOND).toFixed(1)}s`;
}

export function formatChatUsageOutputSpeed(
  stats: ChatTimelineUsageStats | null | undefined
): string | null {
  const completionTokens = readUsageTimingNumber(stats?.completionTokens);
  const generationDurationMs = readUsageTimingNumber(stats?.timing.generationDurationMs);
  if (
    completionTokens === null ||
    completionTokens <= 0 ||
    generationDurationMs === null ||
    generationDurationMs <= 0
  ) {
    return null;
  }
  return `${((completionTokens * MILLISECONDS_PER_SECOND) / generationDurationMs).toFixed(1)}/s`;
}

function hasChatUsageEstimatedCost(cost: ChatTimelineUsageEstimatedCost | null): boolean {
  return Boolean(
    cost &&
      (readUsageTimingNumber(cost.inputCacheHit) !== null ||
        readUsageTimingNumber(cost.inputCacheMiss) !== null ||
        readUsageTimingNumber(cost.output) !== null ||
        readUsageTimingNumber(cost.total) !== null)
  );
}

function hasChatUsageTiming(stats: ChatTimelineUsageStats): boolean {
  return (
    readUsageTimingNumber(stats.timing.firstTokenLatencyMs) !== null ||
    readUsageTimingNumber(stats.timing.firstTokenLatencyTotalMs) !== null ||
    readUsageTimingNumber(stats.timing.firstTokenLatencyCount) !== null ||
    readUsageTimingNumber(stats.timing.generationDurationMs) !== null
  );
}

export function hasChatUsageStatsData(
  stats: ChatTimelineUsageStats | null | undefined
): stats is ChatTimelineUsageStats {
  return Boolean(
    stats &&
      (readUsageTimingNumber(stats.promptTokens) !== null ||
        readUsageTimingNumber(stats.completionTokens) !== null ||
        readUsageTimingNumber(stats.totalTokens) !== null ||
        readUsageTimingNumber(stats.reasoningTokens) !== null ||
        readUsageTimingNumber(stats.cacheHitTokens) !== null ||
        readUsageTimingNumber(stats.cacheMissTokens) !== null ||
        readUsageTimingNumber(stats.llmChatCompletionCount) !== null ||
        readUsageTimingNumber(stats.toolCallCount) !== null ||
        hasChatUsageEstimatedCost(stats.estimatedCost) ||
        hasChatUsageTiming(stats))
  );
}

export function resolveChatUsageToolCallCount(
  stats: ChatTimelineUsageStats | null | undefined
): number | null {
  const toolCallCount = readUsageTimingNumber(stats?.toolCallCount);
  if (toolCallCount !== null) {
    return toolCallCount;
  }
  return hasChatUsageStatsData(stats) ? 0 : null;
}

export function formatChatUsageEstimatedCost(
  cost: ChatTimelineUsageEstimatedCost | null | undefined,
  locale: AppLocale
): string {
  const total = readUsageTimingNumber(cost?.total);
  if (total === null) {
    return '--';
  }

  const currency = cost?.currency.toUpperCase();
  if (currency === 'USD') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currencyDisplay: 'symbol',
      currency: 'USD',
    }).format(total);
  }
  if (currency === 'CNY' || currency === 'RMB' || currency === 'CNH') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currencyDisplay: 'symbol',
      currency: 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(total);
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(total);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameLocalYear(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear();
}

function isYesterdayLocalDay(value: Date, current: Date): boolean {
  const yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
  return isSameLocalDay(value, yesterday);
}

function formatSecondTenths(value: number): string {
  const wholeSeconds = Math.floor(value / TENTHS_PER_SECOND);
  const tenths = value % TENTHS_PER_SECOND;
  return tenths === 0 ? String(wholeSeconds) : `${wholeSeconds}.${tenths}`;
}

export function formatChatDetailTimestamp(
  value: number,
  now: number = Date.now(),
  todayLabelOrYesterdayLabel?: string,
  yesterdayLabel?: string
): string {
  const hasTodayLabel = yesterdayLabel !== undefined;
  const todayLabel = hasTodayLabel
    ? todayLabelOrYesterdayLabel || DEFAULT_TODAY_LABEL
    : DEFAULT_TODAY_LABEL;
  const resolvedYesterdayLabel = hasTodayLabel
    ? yesterdayLabel || DEFAULT_YESTERDAY_LABEL
    : todayLabelOrYesterdayLabel || DEFAULT_YESTERDAY_LABEL;
  const numericValue = Number(value);
  const numericNow = Number(now);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || !Number.isFinite(numericNow)) {
    return '';
  }

  const timestamp = new Date(numericValue);
  const current = new Date(numericNow);
  if (Number.isNaN(timestamp.getTime()) || Number.isNaN(current.getTime())) {
    return '';
  }

  const timeText = `${pad2(timestamp.getHours())}:${pad2(timestamp.getMinutes())}`;
  if (isSameLocalDay(timestamp, current)) {
    return `${todayLabel} ${timeText}`;
  }

  if (isYesterdayLocalDay(timestamp, current)) {
    return `${resolvedYesterdayLabel} ${timeText}`;
  }

  const dateText = `${pad2(timestamp.getMonth() + 1)}/${pad2(timestamp.getDate())}`;
  if (isSameLocalYear(timestamp, current)) {
    return `${dateText} ${timeText}`;
  }

  return `${timestamp.getFullYear()}/${dateText} ${timeText}`;
}

export function formatChatDetailDuration(value: number | null | undefined, t: TFunction = defaultT): string {
  if (value === null || value === undefined) {
    return '';
  }

  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '';
  }

  const totalTenths = Math.round(durationMs / 100);
  const totalSeconds = Math.floor(totalTenths / TENTHS_PER_SECOND);
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = formatSecondTenths(
    (totalSeconds % SECONDS_PER_MINUTE) * TENTHS_PER_SECOND + (totalTenths % TENTHS_PER_SECOND)
  );

  if (hours > 0) {
    return t('chatDetail.duration.hours', { hours, minutes, seconds });
  }
  if (minutes > 0) {
    return t('chatDetail.duration.minutes', { minutes, seconds });
  }
  return t('chatDetail.duration.seconds', { seconds });
}

export function formatChatDetailRunningDuration(startedAt: number | null | undefined, now: number = Date.now()): string {
  const startTime = Number(startedAt);
  const currentTime = Number(now);
  if (!Number.isFinite(startTime) || startTime <= 0 || !Number.isFinite(currentTime) || currentTime <= startTime) {
    return '';
  }

  const elapsedSeconds = Math.floor((currentTime - startTime) / MILLISECONDS_PER_SECOND);
  return elapsedSeconds >= 1 ? `${elapsedSeconds}s` : '';
}

export function formatChatStatusLabel(status: ChatSocketStatus, t: TFunction = defaultT): string {
  switch (status) {
    case 'connected':
      return t('chatDetail.status.connected');
    case 'connecting':
      return t('chatDetail.status.connecting');
    case 'reconnecting':
      return t('chatDetail.status.reconnecting');
    case 'disconnected':
      return t('chatDetail.status.disconnected');
    case 'idle':
    default:
      return t('chatDetail.status.idle');
  }
}

export function formatMessageDeliveryStatusLabel(
  status: ChatMessageItem['deliveryStatus'],
  t: TFunction = defaultT
): string {
  switch (status) {
    case 'pending':
      return t('composer.sending');
    case 'failed':
      return t('attachment.status.failed');
    case 'sent':
    default:
      return t('attachment.status.ready');
  }
}

export function formatMessageRoleLabel(
  role: ChatMessageItem['role'],
  t: TFunction = defaultT
): string {
  return role === 'user' ? t('chatDetail.role.user') : t('chatDetail.role.assistant');
}
