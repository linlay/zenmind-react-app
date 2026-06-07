import { memo, ReactElement, ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { appVisualTokens } from '../visual/foundation';

type ScreenHeaderActions =
  | readonly []
  | readonly [ReactElement]
  | readonly [ReactElement, ReactElement];

const EMPTY_ACTIONS = [] as const satisfies ScreenHeaderActions;
const HEADER_HEIGHT = 56;
const ACTION_SLOT_SIZE = 40;
const ACTION_RAIL_WIDTH = ACTION_SLOT_SIZE * 2 + appVisualTokens.spacing.sm;
const HEADER_HORIZONTAL_PADDING = appVisualTokens.spacing.md;

export type ScreenHeaderProps = {
  title: ReactNode;
  leftActions?: ScreenHeaderActions;
  rightActions?: ScreenHeaderActions;
  actionRailWidth?: number;
  style?: StyleProp<ViewStyle>;
  titleContainerStyle?: StyleProp<ViewStyle>;
  titleTextStyle?: StyleProp<TextStyle>;
};

export const ScreenHeader = memo(function ScreenHeader({
  title,
  leftActions = EMPTY_ACTIONS,
  rightActions = EMPTY_ACTIONS,
  actionRailWidth,
  style,
  titleContainerStyle,
  titleTextStyle,
}: ScreenHeaderProps) {
  const isPrimitiveTitle = typeof title === 'string' || typeof title === 'number';
  const actionRailWidthStyle = actionRailWidth ? { width: actionRailWidth } : null;

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.actionRail, actionRailWidthStyle, styles.leftRail]}>
        {leftActions[0] ? <View style={styles.actionSlot}>{leftActions[0]}</View> : null}
        {leftActions[1] ? <View style={styles.actionSlot}>{leftActions[1]}</View> : null}
      </View>

      <View style={[styles.titleContainer, titleContainerStyle]}>
        {isPrimitiveTitle ? (
          <Text numberOfLines={1} style={[styles.titleText, titleTextStyle]}>
            {title}
          </Text>
        ) : (
          title
        )}
      </View>

      <View style={[styles.actionRail, actionRailWidthStyle, styles.rightRail]}>
        {rightActions[0] ? <View style={styles.actionSlot}>{rightActions[0]}</View> : null}
        {rightActions[1] ? <View style={styles.actionSlot}>{rightActions[1]}</View> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_HEIGHT,
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    backgroundColor: appVisualTokens.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  actionRail: {
    width: ACTION_RAIL_WIDTH,
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
  },
  leftRail: {
    justifyContent: 'flex-start',
  },
  rightRail: {
    justifyContent: 'flex-end',
  },
  actionSlot: {
    width: ACTION_SLOT_SIZE,
    height: ACTION_SLOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
    height: HEADER_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: appVisualTokens.spacing.xs,
    overflow: 'hidden',
  },
  titleText: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
    textAlign: 'center',
  },
});
