import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useT } from '../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider.tsx';
import { cn } from '../../../shared/visual/className.ts';
import type { ChatTimelineProcessSummaryDisplayItem } from '../../chatTimeline/index.ts';
import { formatChatDetailRunDuration } from '../chatDetailFormatters.ts';
import { ChatTimelineRail } from './ChatTimelineRail.tsx';

type ProcessSummaryTimelineRowProps = {
  item: ChatTimelineProcessSummaryDisplayItem;
  onToggle: (processId: string) => void;
};

const ROW_CLASS = 'mb-4 flex-row items-stretch gap-2 rounded-app-sm active:bg-app-surface-muted';
const BODY_CLASS = 'min-w-0 flex-1';
const HEADER_CLASS = 'min-h-[32px] flex-row items-center';
const TITLE_CLASS = 'min-w-0 flex-1 text-[15px] font-bold leading-[22px] text-app-secondary';
const ERROR_TITLE_CLASS = 'text-app-danger';

export const ProcessSummaryTimelineRow = memo(function ProcessSummaryTimelineRow({
  item,
  onToggle
}: ProcessSummaryTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const statusLabel =
    item.terminalStatus === 'completed'
      ? t('timeline.process.completed')
      : item.terminalStatus === 'cancelled'
        ? t('timeline.process.cancelled')
        : t('timeline.process.error');
  const duration = formatChatDetailRunDuration(item.durationMs, t);
  const title = duration ? `${statusLabel} ${duration}` : statusLabel;
  const accessibilityLabel = item.expanded ? t('timeline.process.collapse') : t('timeline.process.expand');

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ expanded: item.expanded }}
      onPress={() => onToggle(item.processId)}
      className={ROW_CLASS}
    >
      <ChatTimelineRail
        iconUsage={item.expanded ? 'runtime.collapse' : 'runtime.expand'}
        terminal={item.isLastInRun}
        toneColor={theme.colors.textSecondary}
      />
      <View className={BODY_CLASS}>
        <View className={HEADER_CLASS}>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            className={cn(TITLE_CLASS, item.terminalStatus === 'error' ? ERROR_TITLE_CLASS : null)}
          >
            {title}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});
