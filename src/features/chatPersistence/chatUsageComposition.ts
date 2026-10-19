import type { ChatTimelineUsageStats } from '../chatTimeline/types.ts';

function readCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function buildChatUsageComposition(stats: ChatTimelineUsageStats | null | undefined) {
  const completion = readCount(stats?.completionTokens);
  const reasoning = readCount(stats?.reasoningTokens);
  return {
    total: readCount(stats?.totalTokens),
    prompt: readCount(stats?.promptTokens),
    output: completion !== null && reasoning !== null && reasoning <= completion ? completion - reasoning : null,
    reasoning,
    cacheHit: readCount(stats?.cacheHitTokens),
    cacheMiss: readCount(stats?.cacheMissTokens)
  };
}

export function resolveChatUsageCompositionPercents(values: readonly (number | null)[], base: number | null) {
  const percents = values.map((value) => {
    const percent = value !== null && base !== null && base > 0 ? (value / base) * 100 : null;
    return percent !== null && Number.isFinite(percent) ? percent : null;
  });
  // Keep inconsistent upstream counts visible, but never draw an overflowing composition.
  const valid = percents.reduce<number>((sum, percent) => sum + (percent ?? 0), 0) <= 100.000001;
  return percents.map((percent) => ({ percent, width: valid ? Math.min(100, percent ?? 0) : 0 }));
}

export function formatChatUsageCompositionPercent(percent: number | null): string | null {
  if (percent === null) return null;
  if (percent > 100) return '>100%';
  if (percent > 0 && percent < 0.01) return '<0.01%';
  return `${Number(percent.toFixed(2))}%`;
}
