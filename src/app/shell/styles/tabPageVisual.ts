import { StyleSheet } from 'react-native';

import { AppTheme } from '../../../core/constants/theme';

export const TAB_PAGE_PADDING_HORIZONTAL = 14;
export const TAB_PAGE_PADDING_TOP = 8;
export const TAB_PAGE_PADDING_BOTTOM = 24;

export const TAB_LIST_CONTENT_STYLE = {
  paddingHorizontal: TAB_PAGE_PADDING_HORIZONTAL,
  paddingTop: TAB_PAGE_PADDING_TOP,
  paddingBottom: TAB_PAGE_PADDING_BOTTOM
} as const;

export const TAB_CARD_BASE_STYLE = {
  borderRadius: 14,
  borderWidth: StyleSheet.hairlineWidth
} as const;

export const TAB_ICON_TILE_SIZE = 44;
export const TAB_ICON_TILE_RADIUS = 12;
export const TAB_TITLE_FONT_SIZE = 16;
export const TAB_TITLE_LARGE_FONT_SIZE = 17;
export const TAB_META_FONT_SIZE = 12;
export const TAB_SECONDARY_FONT_SIZE = 13;

export function getTabPagePalette(theme: AppTheme) {
  return {
    pageBackground: theme.surface,
    cardBackground: theme.surfaceStrong,
    cardBorder: theme.border,
    iconTileBackground: theme.surface
  };
}
