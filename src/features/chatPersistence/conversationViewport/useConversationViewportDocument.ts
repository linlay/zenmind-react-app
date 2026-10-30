import { useCallback, useEffect, useRef, useState } from 'react';

import { conversationViewportDocumentStore } from './viewportDocument';
import type { CachedViewDocument } from './viewportDocumentStore';

type ViewportDocumentState = {
  key: string;
  document: CachedViewDocument | null;
  loading: boolean;
  error: string;
};

function initialState(viewportKey: string): ViewportDocumentState {
  return {
    key: viewportKey,
    document: conversationViewportDocumentStore.getCached(viewportKey),
    loading: false,
    error: ''
  };
}

export function useConversationViewportDocument(viewportKey: string, active: boolean) {
  const loadGenerationRef = useRef(0);
  const forceReloadRef = useRef(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [state, setState] = useState(() => initialState(viewportKey));

  useEffect(() => {
    const cached = conversationViewportDocumentStore.getCached(viewportKey);
    if (!active) {
      setState({ key: viewportKey, document: cached, loading: false, error: '' });
      return;
    }
    const force = forceReloadRef.current;
    forceReloadRef.current = false;
    if (cached && !force) {
      setState({ key: viewportKey, document: cached, loading: false, error: '' });
      return;
    }

    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    let disposed = false;
    setState((current) => ({
      key: viewportKey,
      document: current.key === viewportKey ? current.document : cached,
      loading: true,
      error: ''
    }));
    void conversationViewportDocumentStore
      .load(viewportKey, { force })
      .then((document) => {
        if (!disposed && loadGenerationRef.current === generation) {
          setState({ key: viewportKey, document, loading: false, error: '' });
        }
      })
      .catch((error: unknown) => {
        if (!disposed && loadGenerationRef.current === generation) {
          setState((current) => ({
            key: viewportKey,
            document: current.key === viewportKey ? current.document : null,
            loading: false,
            error: error instanceof Error ? error.message : String(error)
          }));
        }
      });

    return () => {
      disposed = true;
    };
  }, [active, reloadNonce, viewportKey]);

  const reload = useCallback(() => {
    forceReloadRef.current = true;
    setReloadNonce((current) => current + 1);
  }, []);
  const current = state.key === viewportKey ? state : initialState(viewportKey);
  return { ...current, reload };
}
