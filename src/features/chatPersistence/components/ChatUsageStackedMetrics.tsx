import { memo } from 'react';
import { Text, View } from 'react-native';

import { useT } from '../../../shared/i18n';
import type { ChatTimelineUsageStats } from '../../chatTimeline/types.ts';
import { formatChatUsageNumber } from '../chatDetailFormatters.ts';
import {
  buildChatUsageComposition,
  formatChatUsageCompositionPercent,
  resolveChatUsageCompositionPercents
} from '../chatUsageComposition.ts';

type UsageSegment = {
  key: string;
  label: string;
  value: number | null;
  colorClass: string;
  hideLegend?: boolean;
};

const COMPOSITIONS_CLASS = 'gap-app-sm';
const COMPOSITION_CLASS = 'gap-[6px]';
const LEGEND_CLASS = 'flex-row flex-wrap items-center gap-x-app-md gap-y-1';
const LEGEND_ITEM_CLASS = 'flex-row items-center gap-1';
const DOT_CLASS = 'h-[5px] w-[5px] rounded-full';
const LABEL_CLASS = 'text-[11px] font-bold leading-[14px] text-app-secondary';
const VALUE_CLASS = 'text-[12px] font-extrabold leading-4 text-app-primary';
const TRACK_CLASS = 'h-1 flex-row overflow-hidden rounded-full bg-app-surface-muted';
const SEGMENT_CLASS = 'h-full shrink-0';
const INPUT_COLOR_CLASS = 'bg-app-success';
const OUTPUT_COLOR_CLASS = 'bg-app-action';
const REASONING_COLOR_CLASS = 'bg-app-usage-reasoning';
const MISS_COLOR_CLASS = 'bg-app-line';

function UsageComposition({
  segments,
  base,
  accessibilityLabel
}: {
  segments: UsageSegment[];
  base: number | null;
  accessibilityLabel: string;
}) {
  const percents = resolveChatUsageCompositionPercents(
    segments.map((segment) => segment.value),
    base
  );
  return (
    <View accessible accessibilityLabel={accessibilityLabel} className={COMPOSITION_CLASS}>
      <View className={LEGEND_CLASS}>
        {segments.map((segment, index) =>
          segment.hideLegend ? null : (
            <View key={segment.key} className={LEGEND_ITEM_CLASS}>
              <View className={`${DOT_CLASS} ${segment.colorClass}`} />
              <Text allowFontScaling={false} className={LABEL_CLASS}>
                {segment.label}
              </Text>
              <Text allowFontScaling={false} className={VALUE_CLASS}>
                {formatChatUsageCompositionPercent(percents[index].percent) ?? formatChatUsageNumber(segment.value)}
              </Text>
            </View>
          )
        )}
      </View>
      <View className={TRACK_CLASS}>
        {segments.map((segment, index) => (
          <View
            key={segment.key}
            className={`${SEGMENT_CLASS} ${segment.colorClass}`}
            style={{ width: `${percents[index].width}%` }}
          />
        ))}
      </View>
    </View>
  );
}

export const ChatUsageStackedMetrics = memo(function ChatUsageStackedMetrics({
  stats
}: {
  stats: ChatTimelineUsageStats | null | undefined;
}) {
  const t = useT();
  const values = buildChatUsageComposition(stats);
  const promptLabel = t('usage.metric.prompt');
  const outputLabel = t('usage.metric.completion');
  const reasoningLabel = t('usage.metric.reasoning');
  const hitLabel = t('usage.metric.cacheHit');
  const missLabel = t('usage.metric.cacheMiss');
  const count = formatChatUsageNumber;

  return (
    <View className={COMPOSITIONS_CLASS}>
      <UsageComposition
        base={values.total}
        segments={[
          { key: 'prompt', label: promptLabel, value: values.prompt, colorClass: INPUT_COLOR_CLASS },
          { key: 'output', label: outputLabel, value: values.output, colorClass: OUTPUT_COLOR_CLASS },
          { key: 'reasoning', label: reasoningLabel, value: values.reasoning, colorClass: REASONING_COLOR_CLASS }
        ]}
        accessibilityLabel={[
          `${t('usage.metric.total')}: ${count(values.total)}`,
          `${promptLabel}: ${count(values.prompt)}`,
          `${outputLabel}: ${count(stats?.completionTokens)}`,
          `${t('usage.metric.outputWithoutReasoning')}: ${count(values.output)}`,
          `${reasoningLabel}: ${count(values.reasoning)}`
        ].join('; ')}
      />
      <UsageComposition
        base={values.prompt}
        segments={[
          { key: 'cacheHit', label: hitLabel, value: values.cacheHit, colorClass: OUTPUT_COLOR_CLASS },
          {
            key: 'cacheMiss',
            label: missLabel,
            value: values.cacheMiss,
            colorClass: MISS_COLOR_CLASS,
            hideLegend: true
          }
        ]}
        accessibilityLabel={[
          `${promptLabel}: ${count(values.prompt)}`,
          `${hitLabel}: ${count(values.cacheHit)}`,
          `${missLabel}: ${count(values.cacheMiss)}`
        ].join('; ')}
      />
    </View>
  );
});
