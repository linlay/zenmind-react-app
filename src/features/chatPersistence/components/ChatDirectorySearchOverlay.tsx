import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens } from '../../../shared/visual/foundation';
import { appHairlineStyles } from '../../../shared/visual/hairline';
import { searchChatDirectoryItems } from '../chatRepository';
import type { ChatDirectoryItem } from '../types';
import {
  CHAT_DIRECTORY_ROW_HEIGHT,
  ChatDirectoryRow,
  createChatDirectoryDisplayItem,
  type ChatDirectoryDisplayItem,
} from './ChatDirectoryRow';

const SEARCH_PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 180;
const SEARCH_FOCUS_DELAY_MS = 80;
const SEARCH_DRAW_DISTANCE = CHAT_DIRECTORY_ROW_HEIGHT * 8;
const MODAL_ROOT_CLASS = 'flex-1 bg-app-surface';
const HEADER_CLASS = 'min-h-[58px] flex-row items-center gap-app-sm border-app-line px-app-md pb-app-sm';
const SEARCH_BOX_CLASS =
  'h-10 min-w-0 flex-1 flex-row items-center gap-app-sm rounded-app-md bg-app-surface-muted px-app-md';
const SEARCH_INPUT_CLASS = 'min-w-0 flex-1 p-0 text-app-body text-app-primary';
const ICON_BUTTON_CLASS = 'h-9 w-9 items-center justify-center rounded-app-pill active:bg-app-background-muted';
const LIST_FRAME_CLASS = 'flex-1 bg-app-surface';
const STATE_BLOCK_CLASS = 'flex-1 items-center justify-center px-app-xl';
const EMPTY_TEXT_CLASS = 'text-center text-[14px] leading-[21px] text-app-secondary';
const ERROR_TEXT_CLASS = 'px-app-xl py-app-sm text-[12px] leading-[17px] text-app-danger';
const FOOTER_CLASS = 'min-h-[48px] items-center justify-center';
const ROW_SHELL_STYLE = { height: CHAT_DIRECTORY_ROW_HEIGHT } satisfies ViewStyle;

type ChatDirectorySearchOverlayProps = {
  visible: boolean;
  onClose: () => void;
  onSelectItem: (item: ChatDirectoryItem) => void;
};

function normalizeSearchInput(query: string): string {
  return query.trim().replace(/\s+/gu, ' ');
}

function getDirectoryItemType(item: ChatDirectoryDisplayItem) {
  return item.kind;
}

export const ChatDirectorySearchOverlay = memo(function ChatDirectorySearchOverlay({
  visible,
  onClose,
  onSelectItem,
}: ChatDirectorySearchOverlayProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const requestSequenceRef = useRef(0);
  const loadMoreLockedRef = useRef(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ChatDirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [errorText, setErrorText] = useState('');
  const normalizedQuery = useMemo(() => normalizeSearchInput(query), [query]);
  const displayItems = useMemo(
    () => items.map((item) => createChatDirectoryDisplayItem(item, t('chatHome.noConversation'))),
    [items, t]
  );
  const inputStyle = useMemo(() => ({ color: theme.colors.textPrimary }), [theme.colors.textPrimary]);
  const listContentStyle = useMemo(
    () => ({
      paddingTop: appVisualTokens.spacing.xs,
      paddingBottom: Math.max(insets.bottom, appVisualTokens.spacing.md),
    }),
    [insets.bottom]
  );

  const loadPage = useCallback(
    async (searchQuery: string, offset: number, requestId: number, append: boolean) => {
      try {
        const page = await searchChatDirectoryItems(searchQuery, offset, SEARCH_PAGE_SIZE);
        if (requestSequenceRef.current !== requestId) {
          return;
        }

        setItems((current) => (append ? [...current, ...page.items] : page.items));
        setHasMore(page.hasMore);
        setErrorText('');
      } catch (error) {
        if (requestSequenceRef.current !== requestId) {
          return;
        }

        if (!append) {
          setItems([]);
        }
        setHasMore(false);
        setErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        if (requestSequenceRef.current === requestId) {
          setLoading(false);
          setLoadingMore(false);
          loadMoreLockedRef.current = false;
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!visible) {
      requestSequenceRef.current += 1;
      setQuery('');
      setItems([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      setErrorText('');
      loadMoreLockedRef.current = false;
      return;
    }

    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
    }, SEARCH_FOCUS_DELAY_MS);

    return () => {
      clearTimeout(focusTimer);
    };
  }, [visible]);

  useEffect(() => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    loadMoreLockedRef.current = false;

    if (!visible) {
      return;
    }

    if (!normalizedQuery) {
      setItems([]);
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      setErrorText('');
      return;
    }

    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    setErrorText('');

    const searchTimer = setTimeout(() => {
      void loadPage(normalizedQuery, 0, requestId, false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(searchTimer);
    };
  }, [loadPage, normalizedQuery, visible]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleClear = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const handleSelectItem = useCallback(
    (item: ChatDirectoryItem) => {
      Keyboard.dismiss();
      onSelectItem(item);
    },
    [onSelectItem]
  );

  const handleEndReached = useCallback(() => {
    if (!visible || !normalizedQuery || !hasMore || loading || loadingMore || loadMoreLockedRef.current) {
      return;
    }

    loadMoreLockedRef.current = true;
    setLoadingMore(true);
    void loadPage(normalizedQuery, items.length, requestSequenceRef.current, true);
  }, [hasMore, items.length, loadPage, loading, loadingMore, normalizedQuery, visible]);

  const renderItem = useCallback(
    ({ item }: { item: ChatDirectoryDisplayItem }) => (
      <View style={ROW_SHELL_STYLE}>
        <ChatDirectoryRow item={item} onPress={handleSelectItem} />
      </View>
    ),
    [handleSelectItem]
  );
  const keyExtractor = useCallback((item: ChatDirectoryDisplayItem) => item.id, []);
  const footer = useMemo(() => {
    if (!loadingMore) {
      return null;
    }

    return (
      <View className={FOOTER_CLASS}>
        <ActivityIndicator size="small" color={theme.colors.brandBlue} />
      </View>
    );
  }, [loadingMore, theme.colors.brandBlue]);
  const emptyText = normalizedQuery
    ? t('chatSearch.empty.noResults', { query: normalizedQuery })
    : t('chatSearch.empty.initial');

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      hardwareAccelerated
      onRequestClose={handleClose}
    >
      <View className={MODAL_ROOT_CLASS} style={{ paddingTop: insets.top }}>
        <View className={HEADER_CLASS} style={appHairlineStyles.borderBottom}>
          <View className={SEARCH_BOX_CLASS}>
            <AppIcon usage="chatHome.search" />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={t('chatSearch.placeholder')}
              placeholderTextColor={theme.colors.textTertiary}
              selectionColor={theme.colors.brandBlue}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              className={SEARCH_INPUT_CLASS}
              style={inputStyle}
            />
            {query.length > 0 ? (
              <Pressable
                accessibilityLabel={t('chatSearch.clear')}
                accessibilityRole="button"
                onPress={handleClear}
                className={ICON_BUTTON_CLASS}
              >
                <AppIcon usage="chatSearch.clear" />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={t('chatSearch.close')}
            accessibilityRole="button"
            onPress={handleClose}
            className={ICON_BUTTON_CLASS}
          >
            <AppIcon usage="chatSearch.close" />
          </Pressable>
        </View>

        {errorText ? (
          <Text className={ERROR_TEXT_CLASS}>{t('chatSearch.error.readFailed', { message: errorText })}</Text>
        ) : null}

        <View className={LIST_FRAME_CLASS}>
          {loading && displayItems.length <= 0 ? (
            <View className={STATE_BLOCK_CLASS}>
              <ActivityIndicator size="small" color={theme.colors.brandBlue} />
            </View>
          ) : (
            <FlashList
              data={displayItems}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              getItemType={getDirectoryItemType}
              drawDistance={SEARCH_DRAW_DISTANCE}
              onEndReached={handleEndReached}
              onEndReachedThreshold={0.45}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={listContentStyle}
              ListEmptyComponent={
                <View className={STATE_BLOCK_CLASS}>
                  <Text className={EMPTY_TEXT_CLASS}>{emptyText}</Text>
                </View>
              }
              ListFooterComponent={footer}
            />
          )}
        </View>
      </View>
    </Modal>
  );
});
