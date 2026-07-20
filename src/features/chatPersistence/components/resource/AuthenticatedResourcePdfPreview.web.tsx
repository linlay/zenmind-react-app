import { memo, useEffect, useState, type CSSProperties } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAppTheme } from '../../../../shared/visual/AppThemeProvider.tsx';
import type { AuthenticatedResourcePdfPreviewProps } from './AuthenticatedResourcePdfPreview.tsx';

const MAX_PDF_PREVIEW_BYTES = 20 * 1024 * 1024;
const IFRAME_STYLE: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 0,
  display: 'block',
  background: 'transparent'
};

export const AuthenticatedResourcePdfPreview = memo(function AuthenticatedResourcePdfPreview({
  source,
  unavailableLabel,
  onError
}: AuthenticatedResourcePdfPreviewProps) {
  const { theme } = useAppTheme();
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let nextObjectUrl = '';
    void (async () => {
      try {
        const response = await fetch(source.uri, {
          headers: source.headers,
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_PDF_PREVIEW_BYTES) {
          throw new Error(unavailableLabel);
        }
        const blob = await response.blob();
        if (blob.size > MAX_PDF_PREVIEW_BYTES) {
          throw new Error(unavailableLabel);
        }
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      } catch {
        if (!controller.signal.aborted) {
          onError(unavailableLabel);
        }
      }
    })();

    return () => {
      controller.abort();
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [onError, source.headers, source.uri, unavailableLabel]);

  if (!objectUrl) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={theme.colors.brandBlue} />
      </View>
    );
  }

  return <iframe title="PDF preview" src={objectUrl} sandbox="" style={IFRAME_STYLE} />;
});
