import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '../../i18n';
import { getConversationPreviewHeight, setConversationPreviewHeight } from './previewCache';
import {
  CONVERSATION_PREVIEW_MAX_SOURCE_BYTES,
  CONVERSATION_PREVIEW_TIMEOUT_MS,
  createConversationPreviewRequestId,
  exceedsConversationPreviewByteLimit,
  parseConversationPreviewEvent,
  serializeConversationPreviewRequest
} from './runtimeBridge';
import { loadConversationPreviewRuntime } from './runtimeLoader';
import type { ConversationPreviewRequest, ConversationPreviewSurfaceProps } from './types';

export function useConversationPreviewRuntime({
  active,
  bridge,
  cacheKey,
  heightBounds,
  initialData,
  kind,
  mode,
  onBridgeEvent,
  retryNonce,
  source,
  theme,
  onError,
  onReady
}: ConversationPreviewSurfaceProps) {
  const t = useT();
  const [runtimeHtml, setRuntimeHtml] = useState('');
  const [height, setHeight] = useState(() => getConversationPreviewHeight(kind, cacheKey, heightBounds));
  const [loaded, setLoaded] = useState(false);
  const requestId = useMemo(() => createConversationPreviewRequestId(cacheKey, retryNonce), [cacheKey, retryNonce]);
  const request = useMemo<ConversationPreviewRequest>(
    () => ({
      requestId,
      kind,
      source,
      theme,
      mode,
      ...(initialData !== undefined ? { initialData } : {}),
      ...(bridge ? { bridge } : {})
    }),
    [bridge, initialData, kind, mode, requestId, source, theme]
  );
  const serializedRequest = useMemo(() => serializeConversationPreviewRequest(request), [request]);

  useEffect(() => {
    setLoaded(false);
  }, [requestId]);

  useEffect(() => {
    setHeight(getConversationPreviewHeight(kind, cacheKey, heightBounds));
  }, [cacheKey, heightBounds, kind]);

  useEffect(() => {
    if (!active) {
      setLoaded(false);
      setRuntimeHtml('');
      return;
    }
    if (exceedsConversationPreviewByteLimit(source, CONVERSATION_PREVIEW_MAX_SOURCE_BYTES)) {
      onError(t('markdownPreview.tooLarge'));
      return;
    }
    let cancelled = false;
    loadConversationPreviewRuntime(kind)
      .then((html) => {
        if (!cancelled) {
          setRuntimeHtml(html);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onError(error instanceof Error ? error.message : t('markdownPreview.runtimeLoadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, kind, onError, retryNonce, source, t]);

  useEffect(() => {
    if (!active || !runtimeHtml || loaded) {
      return;
    }
    const timer = setTimeout(() => onError(t('markdownPreview.timeout')), CONVERSATION_PREVIEW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [active, loaded, onError, runtimeHtml, t]);

  const handleRawEvent = useCallback(
    (raw: unknown) => {
      const previewEvent = parseConversationPreviewEvent(raw, requestId);
      if (!previewEvent) {
        return;
      }
      if (previewEvent.type === 'ready') {
        setLoaded(true);
        onReady();
      } else if (previewEvent.type === 'resize' && mode === 'inline') {
        setHeight(setConversationPreviewHeight(kind, cacheKey, previewEvent.height, heightBounds));
      } else if (previewEvent.type === 'error') {
        setLoaded(false);
        onError(previewEvent.message);
      } else if (
        previewEvent.type === 'frontend_submit' ||
        previewEvent.type === 'close' ||
        previewEvent.type === 'done'
      ) {
        onBridgeEvent?.(previewEvent);
      }
    },
    [cacheKey, heightBounds, kind, mode, onBridgeEvent, onError, onReady, requestId]
  );

  return {
    handleRawEvent,
    height,
    requestId,
    runtimeHtml,
    serializedRequest
  };
}
