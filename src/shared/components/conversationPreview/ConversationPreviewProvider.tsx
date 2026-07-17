import {
  createContext,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore
} from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../icons/AppIcon';
import { useT } from '../../i18n';
import { useAppTheme } from '../../visual/AppThemeProvider';
import { createConversationPreviewHeightCacheKey } from './previewCache';
import { PreviewErrorPanel } from './PreviewErrorPanel';
import { PreviewSurface } from './PreviewSurface';
import { createConversationPreviewVisibilityStore, type ConversationPreviewVisibilityStore } from './visibilityStore';
import { usePreviewExecutionState } from './usePreviewExecutionState';

type HtmlOverlayRequest = {
  source: string;
  sourceHash: string;
};

type ConversationPreviewContextValue = {
  copyText: (text: string) => void;
  openHtmlPreview: (request: HtmlOverlayRequest) => void;
  store: ConversationPreviewVisibilityStore | null;
};

const ConversationPreviewContext = createContext<ConversationPreviewContextValue>({
  copyText: () => {},
  openHtmlPreview: () => {},
  store: null
});
const ConversationPreviewRowContext = createContext<string | null>(null);

const OVERLAY_ROOT_CLASS = 'flex-1 bg-app-background';
const OVERLAY_HEADER_CLASS =
  'min-h-[52px] flex-row items-center gap-app-sm border-b border-app-line bg-app-surface px-app-md';
const OVERLAY_TITLE_CLASS = 'min-w-0 flex-1 text-[16px] font-bold text-app-primary';
const OVERLAY_ACTION_CLASS =
  'h-9 min-w-9 flex-row items-center justify-center gap-1 rounded-app-sm px-2 active:bg-app-surface-muted';
const OVERLAY_ACTION_TEXT_CLASS = 'text-[13px] font-semibold text-app-secondary';
const HtmlPreviewOverlay = memo(function HtmlPreviewOverlay({
  request,
  onClose,
  onCopyText
}: {
  request: HtmlOverlayRequest;
  onClose: () => void;
  onCopyText: (text: string) => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { resolvedPreference } = useAppTheme();
  const { error, handleError, handleReady, handleRetry, retryNonce } = usePreviewExecutionState();
  const cacheKey = createConversationPreviewHeightCacheKey('html', request.sourceHash, resolvedPreference);
  const handleCopy = useCallback(() => onCopyText(request.source), [onCopyText, request.source]);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View className={OVERLAY_ROOT_CLASS} style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className={OVERLAY_HEADER_CLASS}>
          <Text allowFontScaling={false} numberOfLines={1} className={OVERLAY_TITLE_CLASS}>
            {t('markdownPreview.html')}
          </Text>
          <Pressable
            accessibilityLabel={t('markdownPreview.copy')}
            accessibilityRole="button"
            onPress={handleCopy}
            className={OVERLAY_ACTION_CLASS}
          >
            <AppIcon usage="markdownPreview.copy" />
            <Text allowFontScaling={false} className={OVERLAY_ACTION_TEXT_CLASS}>
              {t('markdownPreview.copy')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('markdownPreview.close')}
            accessibilityRole="button"
            onPress={onClose}
            className={OVERLAY_ACTION_CLASS}
          >
            <AppIcon usage="markdownPreview.close" />
          </Pressable>
        </View>
        {error ? <PreviewErrorPanel message={error} onRetry={handleRetry} placement="overlay" /> : null}
        <PreviewSurface
          active={!error}
          cacheKey={cacheKey}
          kind="html"
          mode="overlay"
          retryNonce={retryNonce}
          source={request.source}
          theme={resolvedPreference}
          onError={handleError}
          onReady={handleReady}
        />
      </View>
    </Modal>
  );
});

export function ConversationPreviewProvider({
  children,
  onCopyText,
  store
}: {
  children: ReactNode;
  onCopyText: (text: string) => void;
  store?: ConversationPreviewVisibilityStore;
}) {
  const resolvedStore = useMemo(() => store ?? createConversationPreviewVisibilityStore(), [store]);
  const [htmlOverlay, setHtmlOverlay] = useState<HtmlOverlayRequest | null>(null);
  const openHtmlPreview = useCallback((request: HtmlOverlayRequest) => setHtmlOverlay(request), []);
  const closeHtmlPreview = useCallback(() => setHtmlOverlay(null), []);
  const value = useMemo(
    () => ({ copyText: onCopyText, openHtmlPreview, store: resolvedStore }),
    [onCopyText, openHtmlPreview, resolvedStore]
  );

  useEffect(() => () => resolvedStore.dispose(), [resolvedStore]);

  return (
    <ConversationPreviewContext.Provider value={value}>
      {children}
      {htmlOverlay ? (
        <HtmlPreviewOverlay request={htmlOverlay} onClose={closeHtmlPreview} onCopyText={onCopyText} />
      ) : null}
    </ConversationPreviewContext.Provider>
  );
}

export function ConversationPreviewRowScope({ children, rowKey }: { children: ReactNode; rowKey: string }) {
  return <ConversationPreviewRowContext.Provider value={rowKey}>{children}</ConversationPreviewRowContext.Provider>;
}

export function useConversationPreviewActions() {
  return useContext(ConversationPreviewContext);
}

export function useConversationPreviewRowActive(): boolean {
  const { store } = useContext(ConversationPreviewContext);
  const rowKey = useContext(ConversationPreviewRowContext);
  const subscribe = useCallback(
    (listener: () => void) => (store && rowKey ? store.subscribe(rowKey, listener) : () => {}),
    [rowKey, store]
  );
  const getSnapshot = useCallback(() => (store && rowKey ? store.getSnapshot(rowKey) : true), [rowKey, store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
