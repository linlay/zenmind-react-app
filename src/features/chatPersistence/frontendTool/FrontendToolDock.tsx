import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type {
  FrontendToolSubmitPayloadData,
  SubmitFrontendToolResponse,
} from '../../../core/api/services/chatApi';
import { PreviewErrorPanel } from '../../../shared/components/conversationPreview/PreviewErrorPanel';
import { PreviewSurface } from '../../../shared/components/conversationPreview/PreviewSurface';
import type {
  ConversationPreviewBridgeEvent,
  ConversationPreviewHeightBounds,
} from '../../../shared/components/conversationPreview/types';
import { usePreviewExecutionState } from '../../../shared/components/conversationPreview/usePreviewExecutionState';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { hashConversationPreviewSource } from '../../../shared/markdown/previewSegments';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import type {
  ChatTimelineActiveFrontendTool,
  ChatTimelineFrontendToolResolution,
} from '../../chatTimeline/index.ts';
import { useConversationViewportDocument } from '../conversationViewport/useConversationViewportDocument';

const HEIGHT_BOUNDS: ConversationPreviewHeightBounds = {
  initial: 320,
  minimum: 240,
  maximum: 420,
};
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const CONTAINER_CLASS =
  'mx-app-md mb-app-sm overflow-hidden rounded-app-lg border border-app-brand-line bg-app-surface';
const HEADER_CLASS = 'min-h-11 flex-row items-center gap-app-sm border-b border-app-line px-app-md';
const TITLE_STACK_CLASS = 'min-w-0 flex-1';
const TITLE_CLASS = 'text-[13px] font-bold leading-[18px] text-app-primary';
const META_CLASS = 'font-mono text-[10px] leading-[14px] text-app-tertiary';
const CLOSE_CLASS = 'h-8 w-8 items-center justify-center rounded-app-sm active:bg-app-surface-muted';
const STATUS_CLASS = 'h-60 items-center justify-center gap-app-sm bg-app-surface-muted px-app-md';
const STATUS_TEXT_CLASS = 'text-center text-[12px] leading-[18px] text-app-secondary';
const SUBMIT_STATUS_CLASS = 'border-t border-app-line px-app-md py-2';
const SUBMIT_STATUS_TEXT_CLASS = 'text-[12px] leading-[17px] text-app-secondary';

type FrontendToolDockProps = {
  tool: ChatTimelineActiveFrontendTool;
  onResolve: (toolKey: string, reason: ChatTimelineFrontendToolResolution) => void;
  onSubmit: (payload: FrontendToolSubmitPayloadData) => Promise<SubmitFrontendToolResponse>;
};

export const FrontendToolDock = memo(function FrontendToolDock({
  tool,
  onResolve,
  onSubmit,
}: FrontendToolDockProps) {
  const t = useT();
  const { resolvedPreference, theme } = useAppTheme();
  const submitGenerationRef = useRef(0);
  const resolvedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const { html, loading, error: documentError, reload } = useConversationViewportDocument(
    tool.viewportKey,
    true
  );
  const {
    error: executionError,
    handleError,
    handleReady,
    handleRetry,
    retryNonce,
  } = usePreviewExecutionState();

  const resolve = useCallback(
    (reason: ChatTimelineFrontendToolResolution) => {
      if (resolvedRef.current) {
        return;
      }
      resolvedRef.current = true;
      submitGenerationRef.current += 1;
      onResolve(tool.key, reason);
    },
    [onResolve, tool.key]
  );

  useEffect(() => {
    const timeoutMs = tool.toolTimeoutMs;
    if (!timeoutMs) {
      return;
    }
    const deadline = tool.createdAt + timeoutMs;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        resolve('timeout');
        return;
      }
      timer = setTimeout(schedule, Math.min(remainingMs, MAX_TIMER_DELAY_MS));
    };
    schedule();
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [resolve, tool.createdAt, tool.toolTimeoutMs]);

  useEffect(
    () => () => {
      submitGenerationRef.current += 1;
    },
    []
  );

  const handleSubmit = useCallback(
    (params: Record<string, unknown>) => {
      if (submitting || resolvedRef.current) {
        return;
      }
      const generation = submitGenerationRef.current + 1;
      submitGenerationRef.current = generation;
      setSubmitting(true);
      setSubmitError('');
      void onSubmit({
        toolKey: tool.key,
        runId: tool.runId,
        toolId: tool.toolId,
        params,
      })
        .catch((error: unknown) => {
          if (submitGenerationRef.current === generation && !resolvedRef.current) {
            setSubmitError(
              t('frontendTool.submitFailed', {
                detail: error instanceof Error ? error.message : String(error),
              })
            );
          }
        })
        .finally(() => {
          if (submitGenerationRef.current === generation && !resolvedRef.current) {
            setSubmitting(false);
          }
        });
    },
    [onSubmit, submitting, t, tool.key, tool.runId, tool.toolId]
  );

  const handleBridgeEvent = useCallback(
    (event: ConversationPreviewBridgeEvent) => {
      if (event.type === 'frontend_submit') {
        handleSubmit(event.params);
      } else {
        resolve(event.type);
      }
    },
    [handleSubmit, resolve]
  );
  const handleErrorRetry = useCallback(() => {
    setSubmitError('');
    if (submitError) {
      return;
    }
    if (documentError) {
      reload();
    } else {
      handleRetry();
    }
  }, [documentError, handleRetry, reload, submitError]);
  const initialData = useMemo(
    () => ({
      type: 'tool_init',
      data: {
        runId: tool.runId,
        toolId: tool.toolId,
        viewportKey: tool.viewportKey,
        toolType: tool.toolType,
        toolTimeout: tool.toolTimeoutMs,
        params: tool.toolParams,
      },
    }),
    [tool]
  );
  const cacheKey = useMemo(
    () =>
      `frontend-tool:${hashConversationPreviewSource(tool.key)}:${hashConversationPreviewSource(html)}:${resolvedPreference}`,
    [html, resolvedPreference, tool.key]
  );
  const loadError = documentError
    ? t('frontendTool.loadFailed', { detail: documentError })
    : '';
  const error = loadError || executionError || submitError;
  const title = tool.toolLabel || tool.toolName || t('frontendTool.title');

  return (
    <View className={CONTAINER_CLASS}>
      <View className={HEADER_CLASS}>
        <View className={TITLE_STACK_CLASS}>
          <Text allowFontScaling={false} className={TITLE_CLASS} numberOfLines={1}>
            {title}
          </Text>
          <Text allowFontScaling={false} className={META_CLASS} numberOfLines={1}>
            {tool.toolType} · {tool.toolId}
          </Text>
        </View>
        {loading && html ? (
          <ActivityIndicator size="small" color={theme.colors.brandBlue} />
        ) : null}
        <Pressable
          accessibilityLabel={t('frontendTool.close')}
          accessibilityRole="button"
          onPress={() => resolve('close')}
          className={CLOSE_CLASS}
        >
          <AppIcon usage="markdownPreview.close" />
        </Pressable>
      </View>

      {error ? <PreviewErrorPanel message={error} onRetry={handleErrorRetry} placement="inline" /> : null}
      {!html && !error ? (
        <View className={STATUS_CLASS}>
          <ActivityIndicator size="small" color={theme.colors.brandBlue} />
          <Text allowFontScaling={false} className={STATUS_TEXT_CLASS}>
            {t('frontendTool.loading')}
          </Text>
        </View>
      ) : html ? (
        <PreviewSurface
          active={!executionError}
          bridge="frontend-tool"
          cacheKey={cacheKey}
          heightBounds={HEIGHT_BOUNDS}
          initialData={initialData}
          kind="html"
          mode="inline"
          retryNonce={retryNonce}
          source={html}
          theme={resolvedPreference}
          onBridgeEvent={handleBridgeEvent}
          onError={handleError}
          onReady={handleReady}
        />
      ) : null}

      {submitting ? (
        <View className={SUBMIT_STATUS_CLASS}>
          <Text allowFontScaling={false} className={SUBMIT_STATUS_TEXT_CLASS}>
            {t('frontendTool.submitting')}
          </Text>
        </View>
      ) : null}
    </View>
  );
});
