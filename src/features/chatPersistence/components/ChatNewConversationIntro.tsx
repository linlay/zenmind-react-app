import { memo, useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import type { AgentWonderSuggestion } from '../../../core/api/services/chatApi';
import { AppIconButton } from '../../../shared/icons/AppIconButton';
import { useT } from '../../../shared/i18n';
import { useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import { pickChatWonderSuggestions, resolveChatWonderGridConfig } from './chatWonderDisplay';

type ChatNewConversationIntroProps = {
  agentName: string;
  description?: string;
  wonders: readonly AgentWonderSuggestion[];
  onSelectWonder: (text: string) => void;
};

type WonderCardProps = {
  wonder: AgentWonderSuggestion;
  label: string;
  onPress: (text: string) => void;
  styles: ReturnType<typeof createStyles>;
  layoutStyle: StyleProp<ViewStyle>;
};

const WONDERS_GRID_GAP = appVisualTokens.spacing.sm;
const WONDER_CARD_HEIGHT_RATIO = 0.66;
const WONDER_CARD_MIN_HEIGHT = 124;
const WONDER_CARD_MAX_HEIGHT = 148;

const WonderCard = memo(function WonderCard({ wonder, label, onPress, styles, layoutStyle }: WonderCardProps) {
  const handlePress = useCallback(() => {
    onPress(wonder.text);
  }, [onPress, wonder.text]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [styles.wonderCard, layoutStyle, pressed && styles.wonderCardPressed]}
    >
      <Text allowFontScaling={false} numberOfLines={1} style={styles.wonderLabel}>
        {label}
      </Text>
      <Text allowFontScaling={false} numberOfLines={4} style={styles.wonderText}>
        {wonder.text}
      </Text>
    </Pressable>
  );
});

export const ChatNewConversationIntro = memo(function ChatNewConversationIntro({
  agentName,
  description = '',
  wonders,
  onSelectWonder,
}: ChatNewConversationIntroProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [wondersWidth, setWondersWidth] = useState(0);
  const gridConfig = resolveChatWonderGridConfig(wondersWidth);
  const visibleWonders = useMemo(
    () => pickChatWonderSuggestions(wonders, gridConfig.visibleCount, refreshSeed),
    [gridConfig.visibleCount, refreshSeed, wonders]
  );
  const canRefreshWonders = wonders.length > gridConfig.visibleCount;
  const wonderCardLayoutStyle = useMemo(() => {
    if (wondersWidth <= 0) {
      return null;
    }
    const width = Math.floor(
      (wondersWidth - WONDERS_GRID_GAP * (gridConfig.columnCount - 1)) / gridConfig.columnCount
    );
    return {
      width,
      height: Math.min(
        WONDER_CARD_MAX_HEIGHT,
        Math.max(WONDER_CARD_MIN_HEIGHT, Math.round(width * WONDER_CARD_HEIGHT_RATIO))
      ),
    };
  }, [gridConfig.columnCount, wondersWidth]);
  const handleWondersLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    setWondersWidth((current) => (Math.abs(current - width) > 1 ? width : current));
  }, []);
  const handleRefreshWonders = useCallback(() => {
    if (!canRefreshWonders) {
      return;
    }
    setRefreshSeed((current) => current + 1);
  }, [canRefreshWonders]);

  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <Text allowFontScaling={false} numberOfLines={2} style={styles.title}>
          {t('chatDetail.newConversation.title', { agentName })}
        </Text>
        {description ? (
          <Text allowFontScaling={false} numberOfLines={3} style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>

      {visibleWonders.length > 0 ? (
        <View style={styles.wonders} onLayout={handleWondersLayout}>
          <View style={styles.wondersHeader}>
            <Text allowFontScaling={false} style={styles.wondersTitle}>
              {t('chatDetail.wonders.title')}
            </Text>
            <AppIconButton
              usage="chatDetail.wondersRefresh"
              accessibilityLabel={t('chatDetail.wonders.refresh')}
              disabled={!canRefreshWonders}
              hitSlop={8}
              onPress={handleRefreshWonders}
              size={16}
              style={[styles.refreshButton, !canRefreshWonders && styles.refreshButtonDisabled]}
              pressedStyle={styles.refreshButtonPressed}
            />
          </View>
          <View style={styles.wonderGrid}>
            {visibleWonders.map((wonder, index) => (
              <WonderCard
                key={`${wonder.id}:${index}`}
                wonder={wonder}
                label={
                  wonder.title !== wonder.text
                    ? wonder.title
                    : t('chatDetail.wonders.cardLabel', { index: index + 1 })
                }
                onPress={onSelectWonder}
                styles={styles}
                layoutStyle={wonderCardLayoutStyle || styles.wonderCardFallback}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    root: {
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
      gap: appVisualTokens.spacing.xl,
      paddingHorizontal: appVisualTokens.spacing.sm,
    },
    heading: {
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm,
    },
    title: {
      fontSize: 22,
      lineHeight: 30,
      fontWeight: '700',
      textAlign: 'center',
      color: theme.colors.textPrimary,
    },
    description: {
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      color: theme.colors.textSecondary,
    },
    wonders: {
      gap: appVisualTokens.spacing.sm,
    },
    wondersHeader: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.sm,
    },
    wondersTitle: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      color: theme.colors.brandBlueAction,
    },
    refreshButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted,
    },
    refreshButtonPressed: {
      backgroundColor: theme.colors.brandBlueSoft,
    },
    refreshButtonDisabled: {
      opacity: 0.38,
    },
    wonderGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: WONDERS_GRID_GAP,
    },
    wonderCard: {
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: appVisualTokens.spacing.sm,
      paddingVertical: appVisualTokens.spacing.sm,
      gap: appVisualTokens.spacing.xs,
      justifyContent: 'flex-start',
      overflow: 'hidden',
    },
    wonderCardFallback: {
      width: '48%',
      minHeight: WONDER_CARD_MIN_HEIGHT,
    },
    wonderCardPressed: {
      backgroundColor: theme.colors.brandBlueSoft,
      borderColor: theme.colors.brandBlue,
    },
    wonderLabel: {
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
      color: theme.colors.brandBlue,
    },
    wonderText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: theme.colors.textPrimary,
    },
  });
}
