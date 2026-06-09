type DevelopmentDebugPanelSnapshot = {
  enabled: boolean;
  visible: boolean;
};

type DevelopmentDebugPanelListener = (snapshot: DevelopmentDebugPanelSnapshot) => void;

const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

let currentSnapshot: DevelopmentDebugPanelSnapshot = {
  enabled: false,
  visible: false,
};
const listeners = new Set<DevelopmentDebugPanelListener>();

function emitSnapshot() {
  listeners.forEach((listener) => listener(currentSnapshot));
}

function setPanelSnapshot(nextSnapshot: DevelopmentDebugPanelSnapshot) {
  if (
    !IS_DEV ||
    (currentSnapshot.enabled === nextSnapshot.enabled &&
      currentSnapshot.visible === nextSnapshot.visible)
  ) {
    return;
  }

  currentSnapshot = nextSnapshot;
  emitSnapshot();
}

export function getDevelopmentDebugPanelSnapshot(): DevelopmentDebugPanelSnapshot {
  return currentSnapshot;
}

export function subscribeDevelopmentDebugPanel(listener: DevelopmentDebugPanelListener) {
  if (!IS_DEV) {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openDevelopmentDebugPanel() {
  setPanelSnapshot({
    enabled: true,
    visible: true,
  });
}

export function setDevelopmentDebugPanelEnabled(enabled: boolean) {
  setPanelSnapshot({
    enabled,
    visible: enabled ? currentSnapshot.visible : false,
  });
}

export function closeDevelopmentDebugPanel() {
  setPanelSnapshot({
    ...currentSnapshot,
    visible: false,
  });
}

export function disableDevelopmentDebugPanel() {
  setPanelSnapshot({
    enabled: false,
    visible: false,
  });
}
