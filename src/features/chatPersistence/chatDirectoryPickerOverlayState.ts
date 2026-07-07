import {
  CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY,
  getChatDrawerHiddenOffset,
  getChatDrawerPanelWidth,
} from './chatDrawerOverlayGeometry.ts';

export type DirectoryPickerLoadGate = {
  tryAcquire: () => boolean;
  release: () => void;
  reset: () => void;
};

export function createDirectoryPickerLoadGate(): DirectoryPickerLoadGate {
  let locked = false;

  return {
    tryAcquire() {
      if (locked) {
        return false;
      }

      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    reset() {
      locked = false;
    },
  };
}

export function getDirectoryPickerPanelWidth(windowWidth: number): number {
  return getChatDrawerPanelWidth(windowWidth, CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY);
}

export function getDirectoryPickerHiddenOffset(windowWidth: number): number {
  return getChatDrawerHiddenOffset(windowWidth, 'left', CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY);
}
