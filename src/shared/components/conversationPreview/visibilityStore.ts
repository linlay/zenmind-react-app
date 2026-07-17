type RowListener = () => void;

export type ConversationPreviewVisibilityStore = {
  dispose: () => void;
  getSnapshot: (rowKey: string) => boolean;
  replaceVisibleRows: (rowKeys: Iterable<string>) => void;
  subscribe: (rowKey: string, listener: RowListener) => () => void;
};

export function createConversationPreviewVisibilityStore(releaseDelayMs = 600): ConversationPreviewVisibilityStore {
  const visibleRows = new Set<string>();
  const retainedRows = new Set<string>();
  const listeners = new Map<string, Set<RowListener>>();
  const releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const notify = (rowKey: string) => {
    listeners.get(rowKey)?.forEach((listener) => listener());
  };

  const cancelRelease = (rowKey: string) => {
    const timer = releaseTimers.get(rowKey);
    if (timer) {
      clearTimeout(timer);
      releaseTimers.delete(rowKey);
    }
  };

  return {
    getSnapshot: (rowKey) => retainedRows.has(rowKey),
    replaceVisibleRows(rowKeys) {
      const nextVisibleRows = new Set(rowKeys);
      nextVisibleRows.forEach((rowKey) => {
        cancelRelease(rowKey);
        visibleRows.add(rowKey);
        if (!retainedRows.has(rowKey)) {
          retainedRows.add(rowKey);
          notify(rowKey);
        }
      });

      Array.from(visibleRows).forEach((rowKey) => {
        if (nextVisibleRows.has(rowKey)) {
          return;
        }
        visibleRows.delete(rowKey);
        cancelRelease(rowKey);
        releaseTimers.set(
          rowKey,
          setTimeout(() => {
            releaseTimers.delete(rowKey);
            if (!visibleRows.has(rowKey) && retainedRows.delete(rowKey)) {
              notify(rowKey);
            }
          }, releaseDelayMs)
        );
      });
    },
    subscribe(rowKey, listener) {
      let rowListeners = listeners.get(rowKey);
      if (!rowListeners) {
        rowListeners = new Set();
        listeners.set(rowKey, rowListeners);
      }
      rowListeners.add(listener);
      return () => {
        rowListeners?.delete(listener);
        if (rowListeners?.size === 0) {
          listeners.delete(rowKey);
        }
      };
    },
    dispose() {
      releaseTimers.forEach(clearTimeout);
      releaseTimers.clear();
      visibleRows.clear();
      retainedRows.clear();
      listeners.clear();
    }
  };
}
