import { useCallback, useEffect, useRef, useState } from 'react';

import { downloadAuthenticatedResource } from '../../../../core/api/services/authenticatedResourceDownload.ts';

export type AuthenticatedResourceDownloadState = 'idle' | 'loading' | 'success' | 'error';

export function useAuthenticatedResourceDownload(resourceUrl: string, fileName: string) {
  const [state, setState] = useState<AuthenticatedResourceDownloadState>('idle');
  const [downloadedName, setDownloadedName] = useState('');
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const loadingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      loadingRef.current = false;
    };
  }, []);
  useEffect(() => {
    requestRef.current += 1;
    loadingRef.current = false;
    setState('idle');
    setDownloadedName('');
  }, [fileName, resourceUrl]);

  const download = useCallback(() => {
    if (!resourceUrl || !fileName || loadingRef.current) {
      return;
    }
    loadingRef.current = true;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setState('loading');
    setDownloadedName('');
    void downloadAuthenticatedResource({ resourceUrl, fileName })
      .then((result) => {
        if (mountedRef.current && requestRef.current === requestId) {
          loadingRef.current = false;
          setDownloadedName(result.fileName);
          setState('success');
        }
      })
      .catch(() => {
        if (mountedRef.current && requestRef.current === requestId) {
          loadingRef.current = false;
          setState('error');
        }
      });
  }, [fileName, resourceUrl]);

  return { state, downloadedName, download };
}
