import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { fetchViewportHtml } from '../../../core/network/apiClient';

interface ViewportBlockViewProps {
  viewportKey: string;
  payload: Record<string, unknown> | null;
  backendUrl: string;
  theme: {
    primary: string;
    danger: string;
    border: string;
    textSoft: string;
  };
  contentWidth: number;
}

export function ViewportBlockView({ viewportKey, payload, backendUrl, theme, contentWidth }: ViewportBlockViewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchViewportHtml(backendUrl, viewportKey)
      .then((result) => {
        if (!cancelled) {
          setHtml(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load viewport');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backendUrl, viewportKey]);

  const handleLoad = useCallback(() => {
    if (!webViewRef.current || !payload) return;
    const initScript = `
      try {
        window.postMessage(${JSON.stringify({ type: 'tool_init', data: { params: payload } })}, '*');
      } catch(e) {}
      true;
    `;
    webViewRef.current.injectJavaScript(initScript);
  }, [payload]);

  if (loading) {
    return (
      <View style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  if (error || !html) {
    return (
      <View style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 }}>
        <Text style={{ color: theme.danger, fontSize: 12 }}>{error || 'Viewport unavailable'}</Text>
      </View>
    );
  }

  return (
    <View
      style={{
        minHeight: 80,
        maxHeight: 320,
        borderRadius: 10,
        overflow: 'hidden',
        marginVertical: 6,
        borderWidth: 1,
        borderColor: theme.border
      }}
    >
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={{ flex: 1, backgroundColor: 'transparent', width: Math.max(60, contentWidth - 86) }}
        javaScriptEnabled
        onLoad={handleLoad}
        scrollEnabled
        nestedScrollEnabled
      />
    </View>
  );
}
