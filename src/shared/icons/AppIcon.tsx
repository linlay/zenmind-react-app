import { memo } from 'react';

import { AppLineIcon } from '../visual/AppLineIcon';
import { useAppTheme } from '../visual/AppThemeProvider';
import { appVisualTokens, type AppVisualColors } from '../visual/foundation';
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

const APP_ICON_COLOR_KEY_BY_ROLE: Record<AppIconColorRole, keyof AppVisualColors> = {
  brand: 'brandBlue',
  brandStrong: 'brandBlueStrong',
  primary: 'textPrimary',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  onBrandAction: 'onBrandBlueAction',
  success: 'success',
  warning: 'warning',
};

function getAppIconColorByRole(colors: AppVisualColors, role: AppIconColorRole): string {
  return colors[APP_ICON_COLOR_KEY_BY_ROLE[role]];
}

export const AppIcon = memo(function AppIcon({ usage, color, size, strokeWidth }: AppIconProps) {
  const { theme } = useAppTheme();
  const config: AppIconUsageConfig = appIconUsages[usage];

  return (
    <AppLineIcon
      name={config.glyph}
      color={color ?? getAppIconColorByRole(theme.colors, config.colorRole)}
      size={size ?? APP_ICON_SIZE_BY_ROLE[config.sizeRole]}
      strokeWidth={strokeWidth ?? config.strokeWidth}
    />
  );
});
