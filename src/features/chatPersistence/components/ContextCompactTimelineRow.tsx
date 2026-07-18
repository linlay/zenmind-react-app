import { memo } from 'react';
import { Text, View } from 'react-native';

import { type TFunction, useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import type { ChatTimelineContextCompactNode } from '../../chatTimeline/index.ts';
import { formatChatUsageNumber } from '../chatDetailFormatters.ts';
import { ChatTimelineRail } from './ChatTimelineRail';

const TIMELINE_ROW_CLASS = 'mb-4 flex-row items-stretch gap-2';
const TIMELINE_BODY_CLASS = 'min-w-0 flex-1';
const COMPACT_CARD_BASE_CLASS = 'self-stretch rounded-app-sm border px-[10px] py-2';
const COMPACT_CARD_CLASSES = {
  running: `${COMPACT_CARD_BASE_CLASS} border-app-line-strong bg-app-surface-muted`,
  completed: `${COMPACT_CARD_BASE_CLASS} border-app-line bg-app-surface-muted`,
  failed: `${COMPACT_CARD_BASE_CLASS} border-app-danger-line bg-app-danger-soft`
} as const;
const TITLE_CLASSES = {
  running: 'text-[13px] font-bold leading-[19px] text-app-primary',
  completed: 'text-[13px] font-bold leading-[19px] text-app-primary',
  failed: 'text-[13px] font-bold leading-[19px] text-app-danger'
} as const;
const DETAIL_CLASS = 'mt-[2px] text-[12px] leading-[18px] text-app-secondary';

type ContextCompactTimelineRowProps = {
  node: ChatTimelineContextCompactNode;
  isLastInRun: boolean;
};

function buildDetail(node: ChatTimelineContextCompactNode, t: TFunction): string {
  if (node.status === 'failed') {
    return node.errorReason || t('contextCompact.unknownError');
  }
  if (node.status !== 'completed') {
    return '';
  }

  const parts: string[] = [];
  if (node.preCompactTokens !== null && node.postCompactTokens !== null) {
    parts.push(
      t('contextCompact.tokenChange', {
        before: formatChatUsageNumber(node.preCompactTokens),
        after: formatChatUsageNumber(node.postCompactTokens)
      })
    );
  }
  if (node.savedTokens !== null) {
    parts.push(
      node.savedPercent === null
        ? t('contextCompact.savedTokens', {
            count: formatChatUsageNumber(node.savedTokens)
          })
        : t('contextCompact.savedTokensWithPercent', {
            count: formatChatUsageNumber(node.savedTokens),
            percent: node.savedPercent
          })
    );
  }
  return parts.join(' · ');
}

export const ContextCompactTimelineRow = memo(function ContextCompactTimelineRow({
  node,
  isLastInRun
}: ContextCompactTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const title =
    node.status === 'running'
      ? t('contextCompact.running')
      : node.status === 'failed'
        ? t('contextCompact.failed')
        : t('contextCompact.completed');
  const detail = buildDetail(node, t);
  const toneColor =
    node.status === 'running'
      ? theme.colors.brandBlue
      : node.status === 'failed'
        ? theme.colors.danger
        : theme.colors.success;

  return (
    <View className={TIMELINE_ROW_CLASS}>
      <ChatTimelineRail iconUsage="timeline.contextCompactRail" terminal={isLastInRun} toneColor={toneColor} />
      <View className={TIMELINE_BODY_CLASS}>
        <View className={COMPACT_CARD_CLASSES[node.status]}>
          <Text allowFontScaling={false} className={TITLE_CLASSES[node.status]}>
            {title}
          </Text>
          {detail ? (
            <Text allowFontScaling={false} selectable className={DETAIL_CLASS}>
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});
