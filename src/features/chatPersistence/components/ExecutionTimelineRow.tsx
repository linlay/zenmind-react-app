import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppIcon, type AppIconUsage } from '../../../shared/icons/AppIcon.tsx';
import { ChatTimelineRail } from './ChatTimelineRail.tsx';

type ExecutionTimelineRowProps = {
  badge: string;
  children: ReactNode;
  collapseLabel: string;
  collapsedSummary?: ReactNode;
  expanded: boolean;
  expandLabel: string;
  iconUsage: AppIconUsage;
  isLastInRun: boolean;
  metadata: string;
  onToggle: () => void;
  title: string;
  toneColor: string;
};

const ROW_CLASS = 'mb-4 flex-row items-stretch gap-2';
const BODY_CLASS = 'min-w-0 flex-1 gap-[7px]';
const HEADER_CLASS =
  'min-h-[38px] flex-row items-center gap-app-sm rounded-app-sm px-app-xs active:bg-app-surface-muted';
const HEADER_TEXT_CLASS = 'min-w-0 flex-1 gap-[2px]';
const TITLE_ROW_CLASS = 'min-w-0 flex-row items-center gap-app-sm';
const TITLE_CLASS = 'min-w-0 flex-1 text-[14px] font-bold leading-5 text-app-primary';
const BADGE_CLASS =
  'shrink-0 rounded-app-pill bg-app-brand-soft px-[8px] py-[3px] text-[11px] font-bold leading-[15px] text-app-brand-blue';
const META_CLASS = 'text-app-caption leading-[17px] text-app-secondary';
const FOLD_CLASS = 'h-[28px] w-[28px] shrink-0 items-center justify-center rounded-app-sm';

export function ExecutionTimelineRow({
  badge,
  children,
  collapseLabel,
  collapsedSummary,
  expanded,
  expandLabel,
  iconUsage,
  isLastInRun,
  metadata,
  onToggle,
  title,
  toneColor,
}: ExecutionTimelineRowProps) {
  return (
    <View className={ROW_CLASS}>
      <ChatTimelineRail iconUsage={iconUsage} terminal={isLastInRun} toneColor={toneColor} />
      <View className={BODY_CLASS}>
        <Pressable
          accessibilityLabel={expanded ? collapseLabel : expandLabel}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={onToggle}
          className={HEADER_CLASS}
        >
          <View className={HEADER_TEXT_CLASS}>
            <View className={TITLE_ROW_CLASS}>
              <Text allowFontScaling={false} numberOfLines={1} className={TITLE_CLASS}>
                {title}
              </Text>
              <Text allowFontScaling={false} className={BADGE_CLASS}>
                {badge}
              </Text>
            </View>
            <Text allowFontScaling={false} className={META_CLASS}>
              {metadata}
            </Text>
          </View>
          <View className={FOLD_CLASS}>
            <AppIcon usage={expanded ? 'runtime.planCollapse' : 'runtime.planExpand'} />
          </View>
        </Pressable>
        {!expanded ? collapsedSummary : null}
        {expanded ? children : null}
      </View>
    </View>
  );
}
