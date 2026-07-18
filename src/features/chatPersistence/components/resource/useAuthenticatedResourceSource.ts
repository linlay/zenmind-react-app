import { useCallback, useEffect, useState } from 'react';

import { resolveAuthenticatedResourceSource } from '../../../../core/api/services/authenticatedResource.ts';
import type { ApiUriSource } from '../../../../core/api/apiClient.ts';

type AuthenticatedResourceSourceState = {
  source: ApiUriSource | null;
  loading: boolean;
  error: string;
};

const IDLE_STATE: AuthenticatedResourceSourceState = {
  source: null,
  loading: false,
  error: ''
};

export function useAuthenticatedResourceSource(resourceUrl: string, active: boolean) {
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<AuthenticatedResourceSourceState>(IDLE_STATE);

  useEffect(() => {
    let cancelled = false;
    if (!active || !resourceUrl) {
      setState(IDLE_STATE);
      return () => {
        cancelled = true;
      };
    }

    setState({ source: null, loading: true, error: '' });
    void resolveAuthenticatedResourceSource(resourceUrl)
      .then((source) => {
        if (!cancelled) {
          setState({ source, loading: false, error: '' });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            source: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Resource failed to load'
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, resourceUrl, retryNonce]);

  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);
  return { ...state, retry };
}
