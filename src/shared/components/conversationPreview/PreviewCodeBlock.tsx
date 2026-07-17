import { memo, useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AppIcon } from '../../icons/AppIcon';
import { useT } from '../../i18n';
import { CONVERSATION_PREVIEW_REGISTRY, type ConversationPreviewKind } from '../../markdown/previewRegistry';
import { useAppTheme } from '../../visual/AppThemeProvider';
import { createConversationPreviewHeightCacheKey } from './previewCache';
import { PreviewErrorPanel } from './PreviewErrorPanel';
import { PreviewSurface } from './PreviewSurface';
import { useConversationPreviewActions, useConversationPreviewRowActive } from './ConversationPreviewProvider';
import { usePreviewExecutionState } from './usePreviewExecutionState';

const ROOT_CLASS = 'mb-[10px] overflow-hidden rounded-app-md border border-app-line bg-app-surface';
const HEADER_CLASS = 'min-h-[42px] flex-row items-center gap-1 border-b border-app-line bg-app-surface-muted px-2';
const TITLE_CLASS = 'min-w-0 flex-1 px-1 text-[13px] font-bold text-app-secondary';
const ACTION_CLASS =
  'h-8 min-w-8 flex-row items-center justify-center gap-1 rounded-app-sm px-2 active:bg-app-background-muted';
const ACTION_TEXT_CLASS = 'text-[12px] font-semibold text-app-secondary';
const SOURCE_CLASS = 'max-h-[360px] bg-app-background-muted px-3 py-[10px]';
const SOURCE_TEXT_CLASS = 'font-mono text-[12px] leading-[18px] text-app-primary';
export const PreviewCodeBlock = memo(function PreviewCodeBlock({
  kind,
  source,
  sourceHash
}: {
  kind: ConversationPreviewKind;
  source: string;
  sourceHash: string;
}) {
  const definition = CONVERSATION_PREVIEW_REGISTRY[kind];
  const t = useT();
  const { resolvedPreference } = useAppTheme();
  const { copyText, openHtmlPreview } = useConversationPreviewActions();
  const rowActive = useConversationPreviewRowActive();
  const [sourceExpanded, setSourceExpanded] = useState(definition.defaultSourceExpanded);
  const expandSource = useCallback(() => setSourceExpanded(true), []);
  const { error, handleError, handleReady, handleRetry, retryNonce } = usePreviewExecutionState(expandSource);
  const cacheKey = createConversationPreviewHeightCacheKey(kind, sourceHash, resolvedPreference);
  const handleToggleSource = useCallback(() => setSourceExpanded((value) => !value), []);
  const handleCopy = useCallback(() => copyText(source), [copyText, source]);
  const handleOpen = useCallback(() => openHtmlPreview({ source, sourceHash }), [openHtmlPreview, source, sourceHash]);
  const sourceToggleLabel = sourceExpanded ? t('markdownPreview.hideSource') : t('markdownPreview.showSource');

  return (
    <View className={ROOT_CLASS}>
      <View className={HEADER_CLASS}>
        <Text allowFontScaling={false} numberOfLines={1} className={TITLE_CLASS}>
          {t(definition.titleKey)}
        </Text>
        {definition.renderer === 'overlay' ? (
          <Pressable
            accessibilityLabel={t('markdownPreview.open')}
            accessibilityRole="button"
            onPress={handleOpen}
            className={ACTION_CLASS}
          >
            <AppIcon usage="markdownPreview.open" />
            <Text allowFontScaling={false} className={ACTION_TEXT_CLASS}>
              {t('markdownPreview.open')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={t('markdownPreview.copy')}
          accessibilityRole="button"
          onPress={handleCopy}
          className={ACTION_CLASS}
        >
          <AppIcon usage="markdownPreview.copy" />
        </Pressable>
        <Pressable
          accessibilityLabel={sourceToggleLabel}
          accessibilityRole="button"
          onPress={handleToggleSource}
          className={ACTION_CLASS}
        >
          <AppIcon usage={sourceExpanded ? 'markdownPreview.collapse' : 'markdownPreview.expand'} />
        </Pressable>
      </View>

      {definition.renderer === 'inline' && !error ? (
        <PreviewSurface
          active={rowActive}
          cacheKey={cacheKey}
          kind={kind}
          mode="inline"
          retryNonce={retryNonce}
          source={source}
          theme={resolvedPreference}
          onError={handleError}
          onReady={handleReady}
        />
      ) : null}

      {error ? <PreviewErrorPanel message={error} onRetry={handleRetry} placement="inline" /> : null}

      {sourceExpanded ? (
        <ScrollView horizontal className={SOURCE_CLASS} contentContainerStyle={{ minWidth: '100%' }}>
          <Text allowFontScaling={false} selectable className={SOURCE_TEXT_CLASS}>
            {source}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
});
