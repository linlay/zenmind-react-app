import { appVisualTokens } from './foundation';

const TAB_BAR_CONTENT_HEIGHT = 44;
const TAB_BAR_TOP_PADDING = appVisualTokens.spacing.xs;
const TAB_BAR_MIN_BOTTOM_PADDING = appVisualTokens.spacing.sm;
const TAB_BAR_EXTRA_BOTTOM_GAP = appVisualTokens.spacing.xs;

export function getAppTabBarMetrics(bottomInset: number) {
  const safeBottomPadding = Math.max(bottomInset, TAB_BAR_MIN_BOTTOM_PADDING);
  const paddingBottom = safeBottomPadding + TAB_BAR_EXTRA_BOTTOM_GAP;

  return {
    height: TAB_BAR_CONTENT_HEIGHT + TAB_BAR_TOP_PADDING + paddingBottom,
    paddingTop: TAB_BAR_TOP_PADDING,
    paddingBottom
  };
}
