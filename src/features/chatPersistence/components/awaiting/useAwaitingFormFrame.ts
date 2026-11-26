import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AwaitingSubmitParam } from '../../../../core/api/services/chatApi';
import {
  CONVERSATION_PREVIEW_MAX_BRIDGE_PARAMS_BYTES,
  exceedsConversationPreviewByteLimit,
  createConversationPreviewRequestId
} from '../../../../shared/components/conversationPreview/runtimeBridge';
import { useI18n, useT } from '../../../../shared/i18n';
import { useAppTheme } from '../../../../shared/visual/AppThemeProvider';
import { useConversationViewportDocument } from '../../conversationViewport/useConversationViewportDocument';
import { buildAwaitingFormFrameHtml, readAwaitingFormFrameReply } from './awaitingFormFrame';
import type { AwaitingFormViewportProps } from './AwaitingFormViewportTypes';

export function useAwaitingFormFrame({ awaiting, disabled, documentKey, onError }: AwaitingFormViewportProps) {
  const t = useT();
  const { locale } = useI18n();
  const { resolvedPreference } = useAppTheme();
  const { document, loading, error } = useConversationViewportDocument(documentKey, true);
  const html = document?.html || '';
  const [generation, setGeneration] = useState(0);
  const [height, setHeight] = useState(260);
  const frameId = useMemo(() => createConversationPreviewRequestId(documentKey, generation), [documentKey, generation]);
  const readyRef = useRef(false);
  const pendingRef = useRef<{
    resolve: (param: AwaitingSubmitParam) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const sendRef = useRef<(message: string) => void>(() => {});
  const form = awaiting.interactive?.kind === 'form' ? awaiting.interactive.form : null;
  const data = useMemo(
    () => ({
      runId: awaiting.runId,
      awaitingId: awaiting.awaitingId,
      mode: 'form',
      view: awaiting.interactive?.view,
      timeout: awaiting.interactive?.timeout,
      form,
      colorScheme: resolvedPreference,
      locale
    }),
    [
      awaiting.runId,
      awaiting.awaitingId,
      awaiting.interactive?.view,
      awaiting.interactive?.timeout,
      form,
      resolvedPreference,
      locale
    ]
  );
  const dataRef = useRef(data);
  dataRef.current = data;
  const post = useCallback(
    (type: 'awaiting_init' | 'awaiting_update' | 'awaiting_collect') => {
      if (
        type !== 'awaiting_collect' &&
        exceedsConversationPreviewByteLimit(
          JSON.stringify(dataRef.current),
          CONVERSATION_PREVIEW_MAX_BRIDGE_PARAMS_BYTES
        )
      ) {
        readyRef.current = false;
        onError('Form data exceeds the 64 KiB safety limit.');
        return;
      }
      sendRef.current(
        JSON.stringify({
          frameId,
          type,
          data:
            type === 'awaiting_collect'
              ? { runId: dataRef.current.runId, awaitingId: dataRef.current.awaitingId, decision: 'submit' }
              : dataRef.current
        })
      );
    },
    [frameId, onError]
  );
  const cancel = useCallback((message: string) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
  }, []);
  useEffect(() => {
    readyRef.current = false;
    return () => {
      readyRef.current = false;
      cancel(t('awaiting.error.viewportCollectCancelled'));
    };
  }, [frameId, cancel, t]);
  useEffect(() => {
    if (readyRef.current) post('awaiting_update');
  }, [data, post]);
  const handleMessage = useCallback(
    (raw: unknown) => {
      const message = readAwaitingFormFrameReply(raw, frameId);
      if (!message) return;
      if (message.type === 'ready') {
        readyRef.current = true;
        post('awaiting_init');
        return;
      }
      if (message.type === 'awaiting_resize' && message.height) {
        setHeight(message.height);
        return;
      }
      const pending = pendingRef.current;
      if (!pending || disabled) return;
      if (message.type === 'frontend_awaiting_invalid') {
        cancel(t('awaiting.error.viewportSubmitInvalid'));
        return;
      }
      if (message.param) {
        pendingRef.current = null;
        clearTimeout(pending.timer);
        pending.resolve(message.param);
      }
    },
    [cancel, disabled, frameId, post, t]
  );
  const collect = useCallback((): Promise<AwaitingSubmitParam> => {
    if (disabled || !html || !readyRef.current) return Promise.reject(new Error(t('awaiting.error.viewportNotReady')));
    if (pendingRef.current) return Promise.reject(new Error(t('awaiting.error.viewportCollectSuperseded')));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cancel(t('awaiting.error.viewportCollectTimeout'));
        readyRef.current = false;
        // Templates do not echo collect IDs. Replacing the timed-out frame makes
        // a later explicit collect immune to its late response.
        setGeneration((current) => current + 1);
      }, 5000);
      pendingRef.current = { resolve, reject, timer };
      post('awaiting_collect');
    });
  }, [cancel, disabled, html, post, t]);
  useEffect(() => {
    if (error) onError(error);
  }, [error, onError]);
  const frameHtml = useMemo(() => (html ? buildAwaitingFormFrameHtml(html, frameId) : ''), [html, frameId]);
  return { collect, frameHtml, frameId, handleMessage, sendRef, height, loading, error };
}
