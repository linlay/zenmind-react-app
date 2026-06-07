import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconUsage } from '../../../shared/icons/AppIcon';
import { appVisualTokens } from '../../../shared/visual/foundation';

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
  toneColor = appVisualTokens.colors.brandBlue,
}: ChatTimelineRailProps) {
  return (
    <View style={styles.rail}>
      <View style={[styles.railLine, terminal && styles.railLineTerminal]} />
      <View style={styles.iconSlot}>
        <AppIcon usage={iconUsage} size={RAIL_ICON_SIZE} color={toneColor} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  rail: {
    width: 18,
    alignItems: 'center',
  },
  railLine: {
    position: 'absolute',
    top: -appVisualTokens.spacing.lg,
    bottom: -appVisualTokens.spacing.xl,
    width: StyleSheet.hairlineWidth,
    backgroundColor: appVisualTokens.colors.lineStrong,
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
    backgroundColor: appVisualTokens.colors.surface,
  },
});
