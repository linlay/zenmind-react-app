import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconUsage } from '../../../shared/icons/AppIcon';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens } from '../../../shared/visual/foundation';

type ChatTimelineRailProps = {
  iconUsage?: AppIconUsage;
  terminal?: boolean;
  toneColor?: string;
};

const RAIL_ICON_SIZE = 16;
const RAIL_LINE_COLOR_CLASS = 'bg-app-line-strong';
const ICON_SLOT_CLASS = 'mt-[3px] h-[18px] w-[18px] items-center justify-center';
const RAIL_STYLES = StyleSheet.create({
  rail: {
    width: 18,
    alignItems: 'center'
  },
  railLineAbove: {
    position: 'absolute',
    top: -appVisualTokens.spacing.lg,
    height: appVisualTokens.spacing.lg + 3,
    width: StyleSheet.hairlineWidth
  },
  railLineBelow: {
    position: 'absolute',
    top: 21,
    bottom: -appVisualTokens.spacing.xl,
    width: StyleSheet.hairlineWidth
  }
});

export const ChatTimelineRail = memo(function ChatTimelineRail({
  iconUsage = 'timeline.defaultRail',
  terminal,
  toneColor
}: ChatTimelineRailProps) {
  const { theme } = useAppTheme();
  const resolvedToneColor = toneColor ?? theme.colors.brandBlue;

  return (
    <View style={RAIL_STYLES.rail}>
      <View className={RAIL_LINE_COLOR_CLASS} style={RAIL_STYLES.railLineAbove} />
      {!terminal ? <View className={RAIL_LINE_COLOR_CLASS} style={RAIL_STYLES.railLineBelow} /> : null}
      <View className={ICON_SLOT_CLASS}>
        <AppIcon usage={iconUsage} size={RAIL_ICON_SIZE} color={resolvedToneColor} />
      </View>
    </View>
  );
});
