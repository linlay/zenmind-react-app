import { memo } from 'react';
import { View } from 'react-native';

import { AppIcon, type AppIconUsage } from '../../../shared/icons/AppIcon';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';

type ChatTimelineRailProps = {
  iconUsage?: AppIconUsage;
  terminal?: boolean;
  toneColor?: string;
};

const RAIL_ICON_SIZE = 16;
const RAIL_CLASS = 'w-[18px] items-center';
const RAIL_LINE_CLASS = 'absolute -top-app-lg -bottom-app-xl w-px bg-app-line-strong';
const RAIL_LINE_TERMINAL_CLASS = 'bottom-[9px]';
const ICON_SLOT_CLASS = 'mt-[3px] h-[18px] w-[18px] items-center justify-center bg-app-surface';

export const ChatTimelineRail = memo(function ChatTimelineRail({
  iconUsage = 'timeline.defaultRail',
  terminal,
  toneColor,
}: ChatTimelineRailProps) {
  const { theme } = useAppTheme();
  const resolvedToneColor = toneColor ?? theme.colors.brandBlue;

  return (
    <View className={RAIL_CLASS}>
      <View className={cn(RAIL_LINE_CLASS, terminal ? RAIL_LINE_TERMINAL_CLASS : null)} />
      <View className={ICON_SLOT_CLASS}>
        <AppIcon usage={iconUsage} size={RAIL_ICON_SIZE} color={resolvedToneColor} />
      </View>
    </View>
  );
});
