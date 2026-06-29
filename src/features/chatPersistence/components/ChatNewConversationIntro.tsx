import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AgentWonderSuggestion } from '../../../core/api/services/chatApi';
import { AppIconButton } from '../../../shared/icons/AppIconButton';
import { useT } from '../../../shared/i18n';
import { useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import { CHAT_WONDER_VISIBLE_COUNT, pickChatWonderSuggestions } from './chatWonderDisplay';

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
};

const WONDER_CARD_MIN_HEIGHT = 82;

const WonderCard = memo(function WonderCard({ wonder, label, onPress, styles }: WonderCardProps) {
  const handlePress = useCallback(() => {
    onPress(wonder.text);
  }, [onPress, wonder.text]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [styles.wonderCard, pressed && styles.wonderCardPressed]}
    >
      <Text allowFontScaling={false} numberOfLines={1} style={styles.wonderLabel}>
        {label}
      </Text>
      <Text allowFontScaling={false} ellipsizeMode="tail" numberOfLines={2} style={styles.wonderText}>
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
  const visibleWonders = useMemo(
    () => pickChatWonderSuggestions(wonders, refreshSeed),
    [refreshSeed, wonders]
  );
  const canRefreshWonders = wonders.length > CHAT_WONDER_VISIBLE_COUNT;
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
        <View style={styles.wonders}>
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
          <View style={styles.wonderList}>
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
    wonderList: {
      gap: appVisualTokens.spacing.sm,
    },
    wonderCard: {
      width: '100%',
      minHeight: WONDER_CARD_MIN_HEIGHT,
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: appVisualTokens.spacing.md,
      paddingVertical: appVisualTokens.spacing.sm,
      gap: appVisualTokens.spacing.xs,
      justifyContent: 'flex-start',
      overflow: 'hidden',
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
