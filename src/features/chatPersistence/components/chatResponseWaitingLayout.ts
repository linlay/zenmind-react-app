export const CHAT_RESPONSE_WAITING_INDICATOR_HEIGHT = 48;
export const CHAT_RESPONSE_WAITING_DOCK_OFFSET_RATIO = 0.05;

export type ChatResponseWaitingPlacement = 'docked' | 'timeline-footer';

type ChatResponseWaitingLayoutMetrics = {
  availableHeight: number;
  contentHeight: number;
};

const LAYOUT_MEASUREMENT_TOLERANCE = 1;

function normalizeHeight(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function getChatResponseWaitingDockBottomOffset(availableHeight: number): number {
  return normalizeHeight(availableHeight) * CHAT_RESPONSE_WAITING_DOCK_OFFSET_RATIO;
}

export function resolveChatResponseWaitingPlacement({
  availableHeight,
  contentHeight
}: ChatResponseWaitingLayoutMetrics): ChatResponseWaitingPlacement {
  const normalizedAvailableHeight = normalizeHeight(availableHeight);
  if (normalizedAvailableHeight <= 0) {
    return 'docked';
  }

  const dockedContentLimit = Math.max(
    0,
    normalizedAvailableHeight -
      CHAT_RESPONSE_WAITING_INDICATOR_HEIGHT -
      getChatResponseWaitingDockBottomOffset(normalizedAvailableHeight)
  );
  return normalizeHeight(contentHeight) <= dockedContentLimit + LAYOUT_MEASUREMENT_TOLERANCE
    ? 'docked'
    : 'timeline-footer';
}

export function getChatResponseWaitingBaseContentHeight(
  measuredContentHeight: number,
  includesTimelineFooterIndicator: boolean
): number {
  return Math.max(
    0,
    normalizeHeight(measuredContentHeight) -
      (includesTimelineFooterIndicator ? CHAT_RESPONSE_WAITING_INDICATOR_HEIGHT : 0)
  );
}
