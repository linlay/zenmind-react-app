import { useCallback, useEffect, useRef, useState } from 'react';

import { conversationViewportDocumentStore } from './viewportDocument';

type ViewportDocumentState = {
  key: string;
  html: string;
  loading: boolean;
  error: string;
};

function initialState(viewportKey: string): ViewportDocumentState {
  return {
    key: viewportKey,
    html: conversationViewportDocumentStore.getCached(viewportKey),
    loading: false,
    error: '',
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
      setState({ key: viewportKey, html: cached, loading: false, error: '' });
      return;
    }
    const force = forceReloadRef.current;
    forceReloadRef.current = false;
    if (cached && !force) {
      setState({ key: viewportKey, html: cached, loading: false, error: '' });
      return;
    }

    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    let disposed = false;
    setState((current) => ({
      key: viewportKey,
      html: current.key === viewportKey ? current.html : cached,
      loading: true,
      error: '',
    }));
    void conversationViewportDocumentStore
      .load(viewportKey, { force })
      .then((html) => {
        if (!disposed && loadGenerationRef.current === generation) {
          setState({ key: viewportKey, html, loading: false, error: '' });
        }
      })
      .catch((error: unknown) => {
        if (!disposed && loadGenerationRef.current === generation) {
          setState((current) => ({
            key: viewportKey,
            html: current.key === viewportKey ? current.html : '',
            loading: false,
            error: error instanceof Error ? error.message : String(error),
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
