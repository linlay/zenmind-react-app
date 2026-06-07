import { memo } from 'react';

import { AppLineIcon } from '../visual/AppLineIcon';
import { appVisualTokens } from '../visual/foundation';
import {
  appIconUsages,
  type AppIconColorRole,
  type AppIconSizeRole,
  type AppIconUsage,
  type AppIconUsageConfig,
} from './registries/appIconUsages';

export type { AppIconUsage } from './registries/appIconUsages';

export type AppIconProps = {
  usage: AppIconUsage;
  color?: string;
  size?: number;
  strokeWidth?: number;
};

const APP_ICON_COLOR_BY_ROLE: Record<AppIconColorRole, string> = {
  brand: appVisualTokens.colors.brandBlue,
  brandStrong: appVisualTokens.colors.brandBlueStrong,
  primary: appVisualTokens.colors.textPrimary,
  secondary: appVisualTokens.colors.textSecondary,
  tertiary: appVisualTokens.colors.textTertiary,
  surface: appVisualTokens.colors.surface,
  success: appVisualTokens.colors.success,
  warning: appVisualTokens.colors.warning,
};

const APP_ICON_SIZE_BY_ROLE: Record<AppIconSizeRole, number> = {
  rail: 12,
  pinMarker: 14,
  toolbar: 15,
  fold: 16,
  sm: appVisualTokens.iconSizes.sm,
  md: appVisualTokens.iconSizes.md,
  lg: appVisualTokens.iconSizes.lg,
  xl: appVisualTokens.iconSizes.xl,
  xxl: appVisualTokens.iconSizes.xxl,
  tab: 24,
};

export const AppIcon = memo(function AppIcon({ usage, color, size, strokeWidth }: AppIconProps) {
  const config: AppIconUsageConfig = appIconUsages[usage];

  return (
    <AppLineIcon
      name={config.glyph}
      color={color ?? APP_ICON_COLOR_BY_ROLE[config.colorRole]}
      size={size ?? APP_ICON_SIZE_BY_ROLE[config.sizeRole]}
      strokeWidth={strokeWidth ?? config.strokeWidth}
    />
  );
});
