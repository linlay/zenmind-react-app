import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconUsage } from '../../../shared/icons/AppIcon';
import { useAppTheme, useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';

type ChatTimelineRailProps = {
  iconUsage?: AppIconUsage;
  terminal?: boolean;
  toneColor?: string;
};

const RAIL_ICON_SIZE = 16;
const RAIL_ICON_TOP_OFFSET = 3;

export const ChatTimelineRail = memo(function ChatTimelineRail({
  iconUsage = 'timeline.defaultRail',
  terminal,
  toneColor,
}: ChatTimelineRailProps) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const resolvedToneColor = toneColor ?? theme.colors.brandBlue;

  return (
    <View style={styles.rail}>
      <View style={[styles.railLine, terminal && styles.railLineTerminal]} />
      <View style={styles.iconSlot}>
        <AppIcon usage={iconUsage} size={RAIL_ICON_SIZE} color={resolvedToneColor} />
      </View>
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    rail: {
      width: 18,
      alignItems: 'center',
    },
    railLine: {
      position: 'absolute',
      top: -appVisualTokens.spacing.lg,
      bottom: -appVisualTokens.spacing.xl,
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.lineStrong,
    },
    railLineTerminal: {
      bottom: 9,
    },
    iconSlot: {
      width: 18,
      height: 18,
      marginTop: RAIL_ICON_TOP_OFFSET,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
    },
  });
}
