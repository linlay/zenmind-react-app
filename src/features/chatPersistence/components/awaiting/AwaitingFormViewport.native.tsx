import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { getAwaitingViewportApi, type AwaitingSubmitParamData } from '../../../../core/api/services/chatApi';
import { useT } from '../../../../shared/i18n';
import { useAppTheme } from '../../../../shared/visual/AppThemeProvider';
import type { ChatTimelineAwaitingForm } from '../../../chatTimeline/index.ts';
import { normalizeAwaitingSubmitParams } from './awaitingSubmitState';
import type {
  AwaitingFormCollectDecision,
  AwaitingFormViewportHandle,
  AwaitingFormViewportProps,
} from './AwaitingFormViewportTypes';

const VIEWPORT_CACHE_LIMIT = 8;
const VIEWPORT_CACHE_TTL_MS = 5 * 60_000;
const COLLECT_TIMEOUT_MS = 5_000;
const DEFAULT_VIEWPORT_HEIGHT = 260;
const MIN_VIEWPORT_HEIGHT = 180;
const MAX_VIEWPORT_HEIGHT = 380;
const STATUS_BOX_CLASS =
  'min-h-28 items-center justify-center gap-app-sm rounded-app-md border border-app-line bg-app-surface-muted p-app-md';
const STATUS_TEXT_CLASS = 'text-center text-[13px] leading-[18px] text-app-secondary';
const ERROR_TEXT_CLASS = 'text-center text-[13px] font-bold leading-[18px] text-app-danger';
const WEB_VIEW_FRAME_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-background';

type CachedViewportHtml = {
  html: string;
  cachedAt: number;
};

const viewportHtmlCache = new Map<string, CachedViewportHtml>();

type PendingCollect = {
  id: number;
  resolve: (params: AwaitingSubmitParamData[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function readCachedHtml(viewportKey: string): string {
  const cached = viewportHtmlCache.get(viewportKey);
  if (!cached) {
    return '';
  }
  if (Date.now() - cached.cachedAt > VIEWPORT_CACHE_TTL_MS) {
    viewportHtmlCache.delete(viewportKey);
    return '';
  }
  viewportHtmlCache.delete(viewportKey);
  viewportHtmlCache.set(viewportKey, cached);
  return cached.html;
}

function writeCachedHtml(viewportKey: string, html: string): void {
  viewportHtmlCache.delete(viewportKey);
  viewportHtmlCache.set(viewportKey, { html, cachedAt: Date.now() });
  while (viewportHtmlCache.size > VIEWPORT_CACHE_LIMIT) {
    const [oldestKey] = viewportHtmlCache.keys();
    if (!oldestKey) {
      return;
    }
    viewportHtmlCache.delete(oldestKey);
  }
}

function cloneFormData(form: ChatTimelineAwaitingForm | undefined): Record<string, unknown> | null {
  return form?.form ? { ...form.form } : null;
}

function clampViewportHeight(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.min(MAX_VIEWPORT_HEIGHT, Math.max(MIN_VIEWPORT_HEIGHT, Math.ceil(numeric)));
}

function parseFrameMessage(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampActiveFormIndex(index: number, formsLength: number): number {
  if (formsLength <= 1) {
    return 0;
  }
  return Math.min(formsLength - 1, Math.max(0, index));
}

function buildViewportData({
  activeFormIndex,
  awaiting,
  forms,
  timeoutMs,
  viewportKey,
}: Pick<AwaitingFormViewportProps, 'activeFormIndex' | 'awaiting' | 'forms' | 'timeoutMs' | 'viewportKey'>) {
  const resolvedActiveFormIndex = clampActiveFormIndex(activeFormIndex, forms.length);
  const activeForm = forms[resolvedActiveFormIndex];
  return {
    runId: awaiting.runId,
    awaitingId: awaiting.awaitingId,
    viewportKey,
    mode: 'form',
    timeout: timeoutMs,
    activeFormIndex: resolvedActiveFormIndex,
    activeFormId: activeForm?.id ?? '',
    forms: forms.map((form) => ({
      id: form.id,
      action: form.action,
      title: form.title,
      form: cloneFormData(form),
    })),
    form: cloneFormData(activeForm),
  };
}

function buildBridgeScript(): string {
  return `
    (function () {
      if (window.__zenmindAwaitingBridgeInstalled) return true;
      window.__zenmindAwaitingBridgeInstalled = true;
      function send(value) {
        try {
          var payload = typeof value === 'string' ? value : JSON.stringify(value);
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(payload);
        } catch (error) {}
      }
      var originalWindowPostMessage = window.postMessage;
      window.postMessage = function (value, targetOrigin) {
        send(value);
        if (typeof originalWindowPostMessage === 'function') {
          try { return originalWindowPostMessage.call(window, value, targetOrigin || '*'); } catch (error) {}
        }
      };
      if (window.parent && window.parent === window) {
        window.parent.postMessage = window.postMessage;
      }
      function reportHeight() {
        var body = document.body;
        var root = document.documentElement;
        var height = Math.max(
          body ? body.scrollHeight : 0,
          body ? body.offsetHeight : 0,
          root ? root.scrollHeight : 0,
          root ? root.offsetHeight : 0
        );
        send({ type: 'awaiting_resize', height: height });
      }
      if (typeof ResizeObserver !== 'undefined') {
        var observer = new ResizeObserver(reportHeight);
        if (document.body) observer.observe(document.body);
      }
      window.addEventListener('load', reportHeight);
      setTimeout(reportHeight, 0);
      setTimeout(reportHeight, 500);
      return true;
    })();
  `;
}

const AWAITING_FORM_VIEWPORT_BRIDGE_SCRIPT = buildBridgeScript();

const AwaitingFormViewportInner = forwardRef<AwaitingFormViewportHandle, AwaitingFormViewportProps>(
  function AwaitingFormViewportInner(
    { activeFormIndex, awaiting, disabled, forms, timeoutMs, viewportKey, onError, onSubmitParams },
    ref
  ) {
    const t = useT();
    const { theme } = useAppTheme();
    const webViewRef = useRef<WebView>(null);
    const pendingCollectRef = useRef<PendingCollect | null>(null);
    const activeViewportKeyRef = useRef(viewportKey);
    const collectSeqRef = useRef(0);
    const viewportData = useMemo(
      () => buildViewportData({ activeFormIndex, awaiting, forms, timeoutMs, viewportKey }),
      [activeFormIndex, awaiting, forms, timeoutMs, viewportKey]
    );
    const [initialHtml] = useState(() => readCachedHtml(viewportKey));
    const [html, setHtml] = useState(initialHtml);
    const [loading, setLoading] = useState(!initialHtml);
    const [loadError, setLoadError] = useState('');
    const [height, setHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);

    activeViewportKeyRef.current = viewportKey;

    const clearPendingCollect = useCallback((error?: Error) => {
      const pending = pendingCollectRef.current;
      if (!pending) {
        return;
      }
      pendingCollectRef.current = null;
      clearTimeout(pending.timer);
      if (error) {
        pending.reject(error);
      }
    }, []);

    const postToFrame = useCallback((type: 'awaiting_init' | 'awaiting_update') => {
      webViewRef.current?.postMessage(
        JSON.stringify({
          type,
          data: viewportData,
        })
      );
    }, [viewportData]);

    useEffect(() => {
      const cached = readCachedHtml(viewportKey);
      if (cached) {
        setHtml(cached);
        setLoading(false);
        setLoadError('');
        return undefined;
      }

      let disposed = false;
      setHtml('');
      setLoading(true);
      setLoadError('');
      getAwaitingViewportApi(viewportKey)
        .then((response) => {
          if (disposed || activeViewportKeyRef.current !== viewportKey) {
            return;
          }
          const nextHtml = String(response.html || '').trim();
          if (!nextHtml) {
            throw new Error('Viewport response does not contain html');
          }
          writeCachedHtml(viewportKey, nextHtml);
          setHtml(nextHtml);
          setLoadError('');
        })
        .catch((error) => {
          if (disposed || activeViewportKeyRef.current !== viewportKey) {
            return;
          }
          const message = t('awaiting.error.viewportLoadFailed', {
            detail: error instanceof Error ? error.message : String(error),
          });
          setLoadError(message);
          onError(message);
        })
        .finally(() => {
          if (!disposed && activeViewportKeyRef.current === viewportKey) {
            setLoading(false);
          }
        });

      return () => {
        disposed = true;
      };
    }, [onError, t, viewportKey]);

    useEffect(
      () => () => {
        clearPendingCollect(new Error(t('awaiting.error.viewportCollectCancelled')));
      },
      [clearPendingCollect, t]
    );

    useEffect(() => {
      if (html) {
        postToFrame('awaiting_update');
      }
    }, [html, postToFrame]);

    useImperativeHandle(
      ref,
      () => ({
        collect(decision: AwaitingFormCollectDecision) {
          if (disabled || !html || !webViewRef.current) {
            return Promise.reject(new Error(t('awaiting.error.viewportNotReady')));
          }
          clearPendingCollect(new Error(t('awaiting.error.viewportCollectSuperseded')));
          const id = collectSeqRef.current + 1;
          collectSeqRef.current = id;
          return new Promise<AwaitingSubmitParamData[]>((resolve, reject) => {
            const timer = setTimeout(() => {
              if (pendingCollectRef.current?.id !== id) {
                return;
              }
              pendingCollectRef.current = null;
              reject(new Error(t('awaiting.error.viewportCollectTimeout')));
            }, COLLECT_TIMEOUT_MS);
            pendingCollectRef.current = { id, resolve, reject, timer };
            webViewRef.current?.postMessage(
              JSON.stringify({
                type: 'awaiting_collect',
                data: {
                  runId: awaiting.runId,
                  awaitingId: awaiting.awaitingId,
                  decision,
                },
              })
            );
          });
        },
      }),
      [awaiting.awaitingId, awaiting.runId, clearPendingCollect, disabled, html, t]
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        const data = parseFrameMessage(event.nativeEvent.data);
        if (!isObjectRecord(data)) {
          return;
        }

        if (data.type === 'awaiting_resize') {
          const nextHeight = clampViewportHeight(data.height);
          if (nextHeight) {
            setHeight((current) => (current === nextHeight ? current : nextHeight));
          }
          return;
        }

        if (data.type === 'close' || data.type === 'done') {
          clearPendingCollect();
          onSubmitParams(forms.map((form) => ({ id: form.id, decision: 'reject' })));
          return;
        }

        if (data.type !== 'frontend_awaiting_submit') {
          return;
        }

        if (!Array.isArray(data.params)) {
          const message = t('awaiting.error.viewportSubmitInvalid');
          onError(message);
          clearPendingCollect(new Error(message));
          return;
        }

        const params = normalizeAwaitingSubmitParams(data.params, 'form');
        if (params.length === 0 || params.length !== data.params.length) {
          const message = t('awaiting.error.viewportSubmitInvalid');
          onError(message);
          clearPendingCollect(new Error(message));
          return;
        }

        const pending = pendingCollectRef.current;
        if (pending) {
          pendingCollectRef.current = null;
          clearTimeout(pending.timer);
          pending.resolve(params);
          return;
        }
        onSubmitParams(params);
      },
      [clearPendingCollect, forms, onError, onSubmitParams, t]
    );

    if (loading) {
      return (
        <View className={STATUS_BOX_CLASS}>
          <ActivityIndicator size="small" color={theme.colors.brandBlue} />
          <Text allowFontScaling={false} className={STATUS_TEXT_CLASS}>
            {t('awaiting.form.loading')}
          </Text>
        </View>
      );
    }

    if (loadError) {
      return (
        <View className={STATUS_BOX_CLASS}>
          <Text allowFontScaling={false} className={ERROR_TEXT_CLASS}>
            {loadError}
          </Text>
        </View>
      );
    }

    if (!html) {
      return (
        <View className={STATUS_BOX_CLASS}>
          <Text allowFontScaling={false} className={STATUS_TEXT_CLASS}>
            {t('awaiting.form.viewportUnavailable')}
          </Text>
        </View>
      );
    }

    return (
      <View className={WEB_VIEW_FRAME_CLASS} style={{ height }}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html }}
          javaScriptEnabled
          domStorageEnabled
          nestedScrollEnabled
          scrollEnabled
          injectedJavaScriptBeforeContentLoaded={AWAITING_FORM_VIEWPORT_BRIDGE_SCRIPT}
          onLoadEnd={() => postToFrame('awaiting_init')}
          onMessage={handleMessage}
          style={{ flex: 1, backgroundColor: theme.colors.background }}
        />
      </View>
    );
  }
);

export const AwaitingFormViewport = memo(AwaitingFormViewportInner);
