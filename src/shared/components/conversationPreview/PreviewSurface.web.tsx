import { memo, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAppTheme } from '../../visual/AppThemeProvider';
import type { ConversationPreviewSurfaceProps } from './types';
import { useConversationPreviewRuntime } from './useConversationPreviewRuntime';

const iframeStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 0,
  display: 'block',
  background: 'transparent'
};

export const PreviewSurface = memo(function PreviewSurface(props: ConversationPreviewSurfaceProps) {
  const { active, kind, mode } = props;
  const { theme: appTheme } = useAppTheme();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { handleRawEvent, height, requestId, runtimeHtml, serializedRequest } = useConversationPreviewRuntime(props);

  useEffect(() => {
    if (!active) {
      return;
    }
    const handleMessage = (message: MessageEvent) => {
      if (message.source === iframeRef.current?.contentWindow) {
        handleRawEvent(message.data);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [active, handleRawEvent]);

  const handleLoad = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(serializedRequest, '*');
  }, [serializedRequest]);
  const containerStyle = mode === 'overlay' ? { flex: 1 } : { height };

  if (!active || !runtimeHtml) {
    return (
      <View className="items-center justify-center bg-app-surface-muted" style={containerStyle}>
        {active ? <ActivityIndicator color={appTheme.colors.brandBlue} /> : null}
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <iframe
        key={requestId}
        ref={iframeRef}
        title={`${kind} preview`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={runtimeHtml}
        onLoad={handleLoad}
        style={iframeStyle}
      />
    </View>
  );
});
