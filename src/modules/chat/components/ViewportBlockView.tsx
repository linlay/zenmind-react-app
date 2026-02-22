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

const DEFAULT_VIEWPORT_HEIGHT = 220;
const MIN_VIEWPORT_HEIGHT = 80;
const MAX_VIEWPORT_HEIGHT = 5000;

const VIEWPORT_AUTOSIZE_SCRIPT = `
(function () {
  if (window.__RN_VIEWPORT_AUTO_SIZE__) {
    true;
    return;
  }
  window.__RN_VIEWPORT_AUTO_SIZE__ = true;
  var lastHeight = 0;
  function postHeight() {
    try {
      var body = document.body;
      var doc = document.documentElement;
      if (!body || !doc || !window.ReactNativeWebView) return;
      var next = Math.max(
        body.scrollHeight, body.offsetHeight, body.clientHeight,
        doc.scrollHeight, doc.offsetHeight, doc.clientHeight
      );
      if (!next || !isFinite(next)) return;
      next = Math.ceil(next);
      if (Math.abs(next - lastHeight) < 2) return;
      lastHeight = next;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'viewport_height', height: next }));
    } catch (e) {}
  }
  window.__RN_REPORT_VIEWPORT_HEIGHT__ = postHeight;
  var schedule = function(delay) { setTimeout(postHeight, delay); };
  schedule(0);
  schedule(60);
  schedule(180);
  schedule(600);
  schedule(1200);
  window.addEventListener('load', function () {
    schedule(0);
    schedule(100);
    schedule(360);
  });
  window.addEventListener('resize', function () {
    schedule(0);
    schedule(80);
  });
  if (typeof MutationObserver === 'function') {
    var observer = new MutationObserver(function () { schedule(0); });
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }
  var images = document.images || [];
  for (var i = 0; i < images.length; i += 1) {
    var image = images[i];
    if (!image) continue;
    image.addEventListener('load', postHeight);
    image.addEventListener('error', postHeight);
  }
  true;
})();
`;

export function ViewportBlockView({ viewportKey, payload, backendUrl, theme, contentWidth }: ViewportBlockViewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [webViewHeight, setWebViewHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setWebViewHeight(DEFAULT_VIEWPORT_HEIGHT);

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
    if (!webViewRef.current) return;
    const scripts: string[] = [];
    if (payload) {
      scripts.push(`
        try {
          window.postMessage(${JSON.stringify({ type: 'tool_init', data: { params: payload } })}, '*');
        } catch(e) {}
      `);
    }
    scripts.push(`
      try {
        if (window.__RN_REPORT_VIEWPORT_HEIGHT__) {
          window.__RN_REPORT_VIEWPORT_HEIGHT__();
        }
      } catch(e) {}
      true;
    `);
    webViewRef.current.injectJavaScript(scripts.join('\n'));
  }, [payload]);

  const handleMessage = useCallback((event: { nativeEvent: { data?: string } }) => {
    const raw = String(event.nativeEvent?.data || '');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { type?: string; height?: unknown };
      if (parsed.type !== 'viewport_height') {
        return;
      }
      const nextHeight = Number(parsed.height);
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
        return;
      }
      const normalized = Math.max(MIN_VIEWPORT_HEIGHT, Math.min(MAX_VIEWPORT_HEIGHT, Math.ceil(nextHeight)));
      setWebViewHeight((prev) => (Math.abs(prev - normalized) < 2 ? prev : normalized));
    } catch {
      // ignore non-json or non-height bridge messages
    }
  }, []);

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
        height: Math.max(MIN_VIEWPORT_HEIGHT, webViewHeight),
        width: Math.max(60, contentWidth - 86),
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
        source={{ html, baseUrl: backendUrl }}
        style={{ height: Math.max(MIN_VIEWPORT_HEIGHT, webViewHeight), width: '100%', backgroundColor: 'transparent' }}
        javaScriptEnabled
        injectedJavaScript={VIEWPORT_AUTOSIZE_SCRIPT}
        onLoad={handleLoad}
        onMessage={handleMessage as never}
        scrollEnabled={false}
        nestedScrollEnabled={false}
      />
    </View>
  );
}
