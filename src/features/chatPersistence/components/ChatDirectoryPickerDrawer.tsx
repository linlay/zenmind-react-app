import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../shared/i18n';
import { AgentAvatar } from '../../../shared/visual/AgentAvatar';
import { appVisualTokens } from '../../../shared/visual/foundation';
import type { ChatDirectoryItem } from '../types';

const DIRECTORY_PICKER_ROW_HEIGHT = 72;
const DIRECTORY_PICKER_DRAW_DISTANCE = DIRECTORY_PICKER_ROW_HEIGHT * 8;
const DIRECTORY_PICKER_PANEL_MAX_WIDTH = 390;
const DIRECTORY_PICKER_ENTER_OFFSET = -72;
const DIRECTORY_PICKER_DRAWER_OVERLAY_Z_INDEX = 120;

type ChatDirectoryPickerDrawerProps = {
  visible: boolean;
  items: ChatDirectoryItem[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  errorText: string;
  hasMore: boolean;
  openingItemId: string | null;
  onClose: () => void;
  onLoadMore: () => void;
  onSelectItem: (item: ChatDirectoryItem) => void;
};

type DirectoryPickerRowProps = {
  item: ChatDirectoryItem;
  opening: boolean;
  onSelect: (item: ChatDirectoryItem) => void;
};

function formatDirectoryPickerCount(loaded: number, total: number, t: TFunction) {
  const safeLoaded = Math.max(0, Math.trunc(Number(loaded) || 0));
  const safeTotal = Math.max(safeLoaded, Math.trunc(Number(total) || 0));

  return safeTotal > safeLoaded
    ? t('common.loadedOfTotal', { loaded: safeLoaded, total: safeTotal })
    : t('common.countItems', { count: safeTotal });
}

function getDirectoryKindLabel(kind: ChatDirectoryItem['kind'], t: TFunction) {
  return kind === 'team' ? t('directoryPicker.kind.team') : t('directoryPicker.kind.agent');
}

function getDirectoryItemType(item: ChatDirectoryItem) {
  return item.kind;
}

const DirectoryPickerRow = memo(function DirectoryPickerRow({ item, opening, onSelect }: DirectoryPickerRowProps) {
  const t = useT();
  const handlePress = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);
  const subtitle = `${getDirectoryKindLabel(item.kind, t)} · ${item.subtitle || t('directoryPicker.canStart')}`;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={opening}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.directoryRow,
        pressed && !opening ? styles.directoryRowPressed : null,
        opening ? styles.directoryRowOpening : null
      ]}
    >
      <AgentAvatar
        type={item.kind}
        icon={item.icon}
        fallbackSeed={item.agentKey || item.teamId || item.title}
        size={42}
      />
      <View style={styles.directoryRowText}>
        <Text numberOfLines={1} style={styles.directoryRowTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.directoryRowSubtitle}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.directoryRowAction}>
        {opening ? (
          <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
        ) : (
          <AppIcon usage="directoryPicker.startConversation" />
        )}
      </View>
    </Pressable>
  );
});

export const ChatDirectoryPickerDrawer = memo(function ChatDirectoryPickerDrawer({
  visible,
  items,
  total,
  loading,
  loadingMore,
  errorText,
  hasMore,
  openingItemId,
  onClose,
  onLoadMore,
  onSelectItem
}: ChatDirectoryPickerDrawerProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(DIRECTORY_PICKER_ENTER_OFFSET)).current;
  const countLabel = useMemo(() => formatDirectoryPickerCount(items.length, total, t), [items.length, total, t]);
  const renderItem = useCallback(
    ({ item }: { item: ChatDirectoryItem }) => (
      <DirectoryPickerRow item={item} opening={openingItemId === item.id} onSelect={onSelectItem} />
    ),
    [onSelectItem, openingItemId]
  );
  const keyExtractor = useCallback((item: ChatDirectoryItem) => item.id, []);
  const handleEndReached = useCallback(() => {
    if (!hasMore || loading || loadingMore) {
      return;
    }

    onLoadMore();
  }, [hasMore, loading, loadingMore, onLoadMore]);
  const footer = useMemo(() => {
    if (loading || items.length <= 0) {
      return null;
    }

    if (loadingMore) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
        </View>
      );
    }

    return <Text style={styles.footerText}>{countLabel}</Text>;
  }, [countLabel, items.length, loading, loadingMore]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    translateX.setValue(DIRECTORY_PICKER_ENTER_OFFSET);
    Animated.spring(translateX, {
      toValue: 0,
      damping: 20,
      stiffness: 230,
      mass: 0.9,
      useNativeDriver: true
    }).start();
  }, [translateX, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.drawerOverlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.panel,
          {
            paddingTop: Math.max(insets.top, appVisualTokens.spacing.xs),
            paddingBottom: Math.max(insets.bottom, appVisualTokens.spacing.md),
            transform: [{ translateX }]
          }
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.title}>
              {t('directoryPicker.title')}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {t('directoryPicker.subtitle', { count: countLabel })}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={t('directoryPicker.close')}
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed ? styles.closeButtonPressed : null]}
          >
            <AppIcon usage="directoryPicker.close" />
          </Pressable>
        </View>

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={styles.listFrame}>
          {loading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
            </View>
          ) : (
            <FlashList
              data={items}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              getItemType={getDirectoryItemType}
              drawDistance={DIRECTORY_PICKER_DRAW_DISTANCE}
              onEndReached={handleEndReached}
              onEndReachedThreshold={0.45}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<Text style={styles.emptyText}>{t('directoryPicker.empty')}</Text>}
              ListFooterComponent={footer}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  drawerOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: DIRECTORY_PICKER_DRAWER_OVERLAY_Z_INDEX,
    elevation: DIRECTORY_PICKER_DRAWER_OVERLAY_Z_INDEX
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appVisualTokens.colors.overlay
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '86%',
    maxWidth: DIRECTORY_PICKER_PANEL_MAX_WIDTH,
    backgroundColor: appVisualTokens.colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: appVisualTokens.colors.line
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
    paddingHorizontal: appVisualTokens.spacing.md,
    paddingBottom: appVisualTokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: appVisualTokens.colors.textSecondary
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: appVisualTokens.radii.pill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeButtonPressed: {
    backgroundColor: appVisualTokens.colors.surfaceMuted
  },
  errorText: {
    paddingHorizontal: appVisualTokens.spacing.md,
    paddingVertical: appVisualTokens.spacing.sm,
    fontSize: 12,
    lineHeight: 17,
    color: appVisualTokens.colors.danger
  },
  listFrame: {
    flex: 1,
    paddingHorizontal: appVisualTokens.spacing.sm
  },
  stateBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    paddingHorizontal: appVisualTokens.spacing.sm,
    paddingVertical: appVisualTokens.spacing.lg,
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textSecondary
  },
  directoryRow: {
    height: DIRECTORY_PICKER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.md,
    paddingHorizontal: appVisualTokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line
  },
  directoryRowPressed: {
    backgroundColor: appVisualTokens.colors.surfaceMuted
  },
  directoryRowOpening: {
    opacity: 0.74
  },
  directoryRowText: {
    flex: 1,
    minWidth: 0
  },
  directoryRowTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary
  },
  directoryRowSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: appVisualTokens.colors.textSecondary
  },
  directoryRowAction: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  footer: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center'
  },
  footerText: {
    paddingVertical: appVisualTokens.spacing.md,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: appVisualTokens.colors.textTertiary
  }
});
