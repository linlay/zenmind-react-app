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

function getAppIconColorByRole(colors: AppVisualColors, role: AppIconColorRole): string {
  if (role === 'brand') {
    return colors.brandBlue;
  }
  if (role === 'brandStrong') {
    return colors.brandBlueStrong;
  }
  if (role === 'primary') {
    return colors.textPrimary;
  }
  if (role === 'secondary') {
    return colors.textSecondary;
  }
  if (role === 'tertiary') {
    return colors.textTertiary;
  }
  if (role === 'onBrandAction') {
    return colors.onBrandBlueAction;
  }
  if (role === 'success') {
    return colors.success;
  }
  return colors.warning;
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
