import { memo } from 'react';
import {
  Pressable,
  type Insets,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppIcon, type AppIconUsage } from './AppIcon';

export type AppIconButtonProps = Omit<PressableProps, 'children' | 'hitSlop' | 'style'> & {
  usage: AppIconUsage;
  accessibilityLabel: string;
  className?: string;
  color?: string;
  size?: number;
  strokeWidth?: number;
  hitSlop?: Insets | number;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
};

export const AppIconButton = memo(function AppIconButton({
  usage,
  className,
  color,
  size,
  strokeWidth,
  style,
  pressedStyle,
  ...pressableProps
}: AppIconButtonProps) {
  return (
    <Pressable
      {...pressableProps}
      accessibilityRole={pressableProps.accessibilityRole ?? 'button'}
      className={className}
      style={style || pressedStyle ? ({ pressed }) => [style, pressed && pressedStyle] : undefined}
    >
      <AppIcon usage={usage} color={color} size={size} strokeWidth={strokeWidth} />
    </Pressable>
  );
});
