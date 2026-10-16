import { chatSyncService } from '../../../chatRealtime/chatSyncService';
import { getChatCacheScopeId, subscribeChatCacheScope } from '../../cacheScope';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  AuthenticatedResourceError,
  resolveAuthenticatedResourceSource,
  type AuthenticatedResourceErrorCode
} from '../../../../core/api/services/authenticatedResource.ts';
import {
  releaseAuthenticatedResourceImageSource,
  resolveAuthenticatedResourceImageSource
} from '../../../../core/api/services/authenticatedResourceImage';
import type { ApiUriSource } from '../../../../core/api/apiClient.ts';

type AuthenticatedResourceSourceState = {
  source: ApiUriSource | null;
  loading: boolean;
  error: string;
  errorCode?: AuthenticatedResourceErrorCode;
};

const IDLE_STATE: AuthenticatedResourceSourceState = {
  source: null,
  loading: false,
  error: ''
};

export function useAuthenticatedResourceSource(resourceUrl: string, active: boolean, imageFileName = '') {
  const cacheScopeId = useSyncExternalStore(subscribeChatCacheScope, getChatCacheScopeId, getChatCacheScopeId);
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<AuthenticatedResourceSourceState>(IDLE_STATE);
  const resolvedRetryNonceRef = useRef(0);

  useEffect(() => {
    if (!active || !resourceUrl) {
      setState(IDLE_STATE);
      return;
    }

    const controller = new AbortController();
    let retainedImage = false;
    const forceRefresh = retryNonce > resolvedRetryNonceRef.current;
    resolvedRetryNonceRef.current = retryNonce;
    setState({ source: null, loading: true, error: '' });
    const resolveSource = imageFileName
      ? resolveAuthenticatedResourceImageSource({
          cacheScopeId,
          resourceUrl,
          fileName: imageFileName,
          forceRefresh,
          signal: controller.signal
        })
      : resourceUrl.startsWith('/api/file?')
        ? chatSyncService.getWorkspaceFile(resourceUrl).then(async (file) => {
            if (file.contentKind === 'text') return { uri: resourceUrl, textContent: file.content || '' };
            return resolveAuthenticatedResourceSource(resourceUrl);
          })
        : resolveAuthenticatedResourceSource(resourceUrl);
    void resolveSource
      .then((source) => {
        retainedImage = Boolean(imageFileName);
        if (!controller.signal.aborted) {
          setState({ source, loading: false, error: '' });
        } else if (retainedImage) {
          releaseAuthenticatedResourceImageSource({ cacheScopeId, resourceUrl, fileName: imageFileName });
          retainedImage = false;
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            source: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Resource failed to load',
            ...(error instanceof AuthenticatedResourceError ? { errorCode: error.code } : {})
          });
        }
      });

    return () => {
      controller.abort();
      if (retainedImage) {
        releaseAuthenticatedResourceImageSource({ cacheScopeId, resourceUrl, fileName: imageFileName });
        retainedImage = false;
      }
    };
  }, [active, imageFileName, resourceUrl, retryNonce, cacheScopeId]);

  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);
  return { ...state, retry };
}
