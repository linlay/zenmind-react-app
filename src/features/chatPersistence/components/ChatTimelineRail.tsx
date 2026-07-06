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
const ICON_SLOT_CLASS = 'mt-[3px] h-[18px] w-[18px] items-center justify-center bg-app-surface';
const RAIL_STYLES = StyleSheet.create({
  rail: {
    width: 18,
    alignItems: 'center',
  },
  railLine: {
    position: 'absolute',
    top: -appVisualTokens.spacing.lg,
    bottom: -appVisualTokens.spacing.xl,
    width: StyleSheet.hairlineWidth,
  },
  railLineTerminal: {
    bottom: 9,
  },
});
const RAIL_LINE_TERMINAL_STYLE = StyleSheet.compose(RAIL_STYLES.railLine, RAIL_STYLES.railLineTerminal);

export const ChatTimelineRail = memo(function ChatTimelineRail({
  iconUsage = 'timeline.defaultRail',
  terminal,
  toneColor,
}: ChatTimelineRailProps) {
  const { theme } = useAppTheme();
  const resolvedToneColor = toneColor ?? theme.colors.brandBlue;

  return (
    <View style={RAIL_STYLES.rail}>
      <View
        className={RAIL_LINE_COLOR_CLASS}
        style={terminal ? RAIL_LINE_TERMINAL_STYLE : RAIL_STYLES.railLine}
      />
      <View className={ICON_SLOT_CLASS}>
        <AppIcon usage={iconUsage} size={RAIL_ICON_SIZE} color={resolvedToneColor} />
      </View>
    </View>
  );
});
