export type ChatDrawerSide = 'left' | 'right';

export type ChatDrawerGeometry = {
  widthRatio: number;
  maxWidth: number;
};

export const CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY = {
  widthRatio: 0.86,
  maxWidth: 390,
} as const satisfies ChatDrawerGeometry;

export const CHAT_HISTORY_DRAWER_GEOMETRY = {
  widthRatio: 0.84,
  maxWidth: 360,
} as const satisfies ChatDrawerGeometry;

export function getChatDrawerPanelWidth(windowWidth: number, geometry: ChatDrawerGeometry): number {
  const safeWindowWidth = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 1;
  return Math.min(Math.ceil(safeWindowWidth * geometry.widthRatio), geometry.maxWidth);
}

export function getChatDrawerHiddenOffset(
  windowWidth: number,
  side: ChatDrawerSide,
  geometry: ChatDrawerGeometry
): number {
  const panelWidth = getChatDrawerPanelWidth(windowWidth, geometry);
  return side === 'left' ? -panelWidth : panelWidth;
}
