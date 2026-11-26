import type { ChatViewReference } from '../../../core/api/services/chatViewProtocol';
import { buildConversationViewDocumentKey } from './viewportDocument';
import { useConversationViewChatId } from './ConversationViewScope';
import { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { PreviewErrorPanel } from '../../../shared/components/conversationPreview/PreviewErrorPanel';
import { PreviewSurface } from '../../../shared/components/conversationPreview/PreviewSurface';
import { useConversationPreviewRowActive } from '../../../shared/components/conversationPreview/ConversationPreviewProvider';
import type { ConversationPreviewHeightBounds } from '../../../shared/components/conversationPreview/types';
import { usePreviewExecutionState } from '../../../shared/components/conversationPreview/usePreviewExecutionState';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useI18n, useT } from '../../../shared/i18n';
import { hashConversationPreviewSource } from '../../../shared/markdown/previewSourceHash';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { useConversationViewportDocument } from './useConversationViewportDocument';

const VIEWPORT_HEIGHT_BOUNDS: ConversationPreviewHeightBounds = {
  initial: 260,
  minimum: 180,
  maximum: 380
};
const CONTAINER_CLASS = 'my-2 overflow-hidden rounded-app-md border border-app-line bg-app-surface';
const HEADER_CLASS = 'min-h-10 flex-row items-center gap-app-sm border-b border-app-line px-app-md';
const TITLE_STACK_CLASS = 'min-w-0 flex-1';
const TITLE_CLASS = 'text-[12px] font-bold leading-[17px] text-app-primary';
const KEY_CLASS = 'font-mono text-[10px] leading-[14px] text-app-tertiary';
const REFRESH_CLASS = 'h-8 w-8 items-center justify-center rounded-app-sm active:bg-app-surface-muted';
const STATUS_CLASS = 'h-[180px] items-center justify-center gap-app-sm bg-app-surface-muted px-app-md';
const STATUS_TEXT_CLASS = 'text-center text-[12px] leading-[18px] text-app-secondary';

export const ConversationViewportBlock = memo(function ConversationViewportBlock({
  payload,
  view,
  viewError = '',
  runId = ''
}: {
  payload: unknown;
  view: ChatViewReference;
  viewError?: string;
  runId?: string;
}) {
  const t = useT();
  const { locale } = useI18n();
  const active = useConversationPreviewRowActive();
  const { resolvedPreference, theme } = useAppTheme();
  const chatId = useConversationViewChatId();
  const documentKey = buildConversationViewDocumentKey(chatId, view, 'display', viewError);
  const { document, loading, error: documentError, reload } = useConversationViewportDocument(documentKey, active);
  const html = document?.html || '';
  const { error: executionError, handleError, handleReady, handleRetry, retryNonce } = usePreviewExecutionState();

  const handleRefresh = useCallback(() => {
    handleRetry();
    reload();
  }, [handleRetry, reload]);
  const viewPayload = useMemo(() => {
    if (typeof payload !== 'string') return payload;
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }, [payload]);
  const cacheKey = useMemo(
    () =>
      `viewport:${hashConversationPreviewSource(documentKey)}:${hashConversationPreviewSource(html)}:${resolvedPreference}`,
    [documentKey, html, resolvedPreference]
  );
  const loadError = documentError ? t('timeline.viewport.loadFailed', { detail: documentError }) : '';
  const error = loadError || executionError;
  const handleErrorRetry = loadError ? reload : handleRetry;

  return (
    <View className={CONTAINER_CLASS}>
      <View className={HEADER_CLASS}>
        <View className={TITLE_STACK_CLASS}>
          <Text allowFontScaling={false} className={TITLE_CLASS}>
            {t('timeline.viewport.title')}
          </Text>
          <Text allowFontScaling={false} className={KEY_CLASS} numberOfLines={1}>
            {view.key}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={t('timeline.viewport.refresh')}
          accessibilityRole="button"
          disabled={loading}
          onPress={handleRefresh}
          className={REFRESH_CLASS}
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.brandBlue} />
          ) : (
            <AppIcon usage="markdownPreview.retry" />
          )}
        </Pressable>
      </View>
      {error ? <PreviewErrorPanel message={error} onRetry={handleErrorRetry} placement="inline" /> : null}
      {!html && !error ? (
        <View className={STATUS_CLASS}>
          <Text allowFontScaling={false} className={STATUS_TEXT_CLASS}>
            {active ? t('timeline.viewport.loading') : t('timeline.viewport.deferred')}
          </Text>
        </View>
      ) : html ? (
        <PreviewSurface
          active={active && !executionError}
          cacheKey={cacheKey}
          heightBounds={VIEWPORT_HEIGHT_BOUNDS}
          initialData={{
            type: 'view_init',
            data: { view, payload: viewPayload, context: { chatId, runId, colorScheme: resolvedPreference, locale } }
          }}
          kind="html"
          mode="inline"
          retryNonce={retryNonce}
          source={html}
          theme={resolvedPreference}
          onError={handleError}
          onReady={handleReady}
        />
      ) : null}
    </View>
  );
});
