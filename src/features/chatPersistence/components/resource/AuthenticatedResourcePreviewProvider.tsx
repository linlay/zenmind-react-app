import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { useT } from '../../../../shared/i18n/index.ts';
import type { AuthenticatedResourcePreviewTarget } from '../../authenticatedResourcePreview.ts';
import { AuthenticatedResourcePreviewModal } from './AuthenticatedResourcePreviewModal.tsx';
import { useAuthenticatedResourceDownload } from './useAuthenticatedResourceDownload.ts';

type AuthenticatedResourcePreviewRequest = {
  target: AuthenticatedResourcePreviewTarget;
  initialError: string;
};

type AuthenticatedResourcePreviewContextValue = {
  openPreview: (target: AuthenticatedResourcePreviewTarget, initialError?: string) => void;
};

const AuthenticatedResourcePreviewContext = createContext<AuthenticatedResourcePreviewContextValue | null>(null);

export function useAuthenticatedResourcePreview(): AuthenticatedResourcePreviewContextValue {
  const value = useContext(AuthenticatedResourcePreviewContext);
  if (!value) {
    throw new Error('useAuthenticatedResourcePreview must be used inside AuthenticatedResourcePreviewProvider');
  }
  return value;
}

export function AuthenticatedResourcePreviewProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [request, setRequest] = useState<AuthenticatedResourcePreviewRequest | null>(null);
  const resourceDownload = useAuthenticatedResourceDownload(
    request?.target.resourceUrl || '',
    request?.target.name || ''
  );
  const closePreview = useCallback(() => setRequest(null), []);
  const openPreview = useCallback(
    (target: AuthenticatedResourcePreviewTarget, initialError = '') => setRequest({ target, initialError }),
    []
  );
  const value = useMemo(() => ({ openPreview }), [openPreview]);

  const downloadFeedback =
    resourceDownload.state === 'success'
      ? t('artifact.downloaded', {
          name: resourceDownload.downloadedName || request?.target.name || ''
        })
      : resourceDownload.state === 'error'
        ? t(
            resourceDownload.errorCode === 'unsupported_transport'
              ? 'artifact.downloadUnavailableRemote'
              : 'artifact.downloadFailed'
          )
        : '';

  return (
    <AuthenticatedResourcePreviewContext.Provider value={value}>
      {children}
      {request ? (
        <AuthenticatedResourcePreviewModal
          key={request.target.key}
          target={request.target}
          visible
          initialError={request.initialError}
          downloadState={resourceDownload.state}
          downloadFeedback={downloadFeedback}
          onClose={closePreview}
          onDownload={resourceDownload.download}
        />
      ) : null}
    </AuthenticatedResourcePreviewContext.Provider>
  );
}
