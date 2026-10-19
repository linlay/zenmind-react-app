import type { ChatDirectorySyncSnapshot } from '../chatRealtime/types.ts';
import {
  CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY,
  getChatDrawerHiddenOffset,
  getChatDrawerPanelWidth
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
    }
  };
}

export function getDirectoryPickerPanelWidth(windowWidth: number): number {
  return getChatDrawerPanelWidth(windowWidth, CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY);
}

export function getDirectoryPickerHiddenOffset(windowWidth: number): number {
  return getChatDrawerHiddenOffset(windowWidth, 'left', CHAT_DIRECTORY_PICKER_DRAWER_GEOMETRY);
}

export type DirectoryPickerStatus = 'loading' | 'syncing' | 'ready' | 'error' | 'offline' | 'unselected';

export function getDirectoryPickerStatus(options: {
  hasSource: boolean;
  offline: boolean;
  reading: boolean;
  hasItems: boolean;
  readFailed: boolean;
  syncStatus: ChatDirectorySyncSnapshot['status'];
}): DirectoryPickerStatus {
  if (!options.hasSource) return 'unselected';
  if (options.offline) return 'offline';
  if (options.readFailed || options.syncStatus === 'error') return 'error';
  const loading = options.reading || options.syncStatus === 'idle' || options.syncStatus === 'loading';
  if (loading) return options.hasItems ? 'syncing' : 'loading';
  return 'ready';
}
