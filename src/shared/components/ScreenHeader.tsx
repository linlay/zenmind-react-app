import { memo, ReactElement, ReactNode } from 'react';
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';

import { cn } from '../visual/className';
import { appHairlineStyles } from '../visual/hairline';

type ScreenHeaderActions =
  | readonly []
  | readonly [ReactElement]
  | readonly [ReactElement, ReactElement];

const EMPTY_ACTIONS = [] as const satisfies ScreenHeaderActions;
const HEADER_CONTAINER_BASE_CLASS = 'flex-row items-center px-app-md';
const HEADER_CONTAINER_DEFAULT_CLASS = 'h-14 border-app-line bg-app-surface';
const ACTION_RAIL_CLASS = 'h-14 w-[88px] flex-row items-center gap-app-sm';
const LEFT_ACTION_RAIL_CLASS = `${ACTION_RAIL_CLASS} justify-start`;
const RIGHT_ACTION_RAIL_CLASS = `${ACTION_RAIL_CLASS} justify-end`;
const ACTION_SLOT_CLASS = 'h-10 min-w-10 items-center justify-center';
const TITLE_CONTAINER_BASE_CLASS = 'min-w-0 flex-1 items-center justify-center overflow-hidden px-app-xs';
const TITLE_CONTAINER_DEFAULT_CLASS = 'h-14';
const TITLE_TEXT_CLASS = 'text-center text-app-title font-bold text-app-primary';

export type ScreenHeaderProps = {
  title: ReactNode;
  leftActions?: ScreenHeaderActions;
  rightActions?: ScreenHeaderActions;
  actionRailWidth?: number;
  className?: string;
  titleContainerClassName?: string;
  titleTextClassName?: string;
  style?: StyleProp<ViewStyle>;
  titleContainerStyle?: StyleProp<ViewStyle>;
  titleTextStyle?: StyleProp<TextStyle>;
};

export const ScreenHeader = memo(function ScreenHeader({
  title,
  leftActions = EMPTY_ACTIONS,
  rightActions = EMPTY_ACTIONS,
  actionRailWidth,
  className,
  titleContainerClassName,
  titleTextClassName,
  style,
  titleContainerStyle,
  titleTextStyle,
}: ScreenHeaderProps) {
  const isPrimitiveTitle = typeof title === 'string' || typeof title === 'number';
  const actionRailWidthStyle = actionRailWidth ? { width: actionRailWidth } : null;

  return (
    <View
      className={cn(HEADER_CONTAINER_BASE_CLASS, className ?? HEADER_CONTAINER_DEFAULT_CLASS)}
      style={className === undefined ? [appHairlineStyles.borderBottom, style] : style}
    >
      <View className={LEFT_ACTION_RAIL_CLASS} style={actionRailWidthStyle}>
        {leftActions[0] ? <View className={ACTION_SLOT_CLASS}>{leftActions[0]}</View> : null}
        {leftActions[1] ? <View className={ACTION_SLOT_CLASS}>{leftActions[1]}</View> : null}
      </View>

      <View
        className={cn(TITLE_CONTAINER_BASE_CLASS, titleContainerClassName ?? TITLE_CONTAINER_DEFAULT_CLASS)}
        style={titleContainerStyle}
      >
        {isPrimitiveTitle ? (
          <Text numberOfLines={1} className={cn(TITLE_TEXT_CLASS, titleTextClassName)} style={titleTextStyle}>
            {title}
          </Text>
        ) : (
          title
        )}
      </View>

      <View className={RIGHT_ACTION_RAIL_CLASS} style={actionRailWidthStyle}>
        {rightActions[0] ? <View className={ACTION_SLOT_CLASS}>{rightActions[0]}</View> : null}
        {rightActions[1] ? <View className={ACTION_SLOT_CLASS}>{rightActions[1]}</View> : null}
      </View>
    </View>
  );
});
