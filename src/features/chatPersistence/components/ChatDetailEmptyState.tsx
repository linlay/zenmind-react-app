import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '../../../shared/i18n';
import { useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';

type ChatDetailEmptyStateProps = {
  errorText?: string;
  onBack: () => void;
  onRetry?: () => void;
};

export function ChatDetailEmptyState({ errorText, onBack, onRetry }: ChatDetailEmptyStateProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>{t('chatDetail.empty.title')}</Text>
      <Text style={styles.emptyStateBody}>{t('chatDetail.empty.body')}</Text>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.emptyStateButton}>
          <Text style={styles.emptyStateButtonText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onBack} style={styles.emptyStateButton}>
        <Text style={styles.emptyStateButtonText}>{t('chatDetail.empty.back')}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      gap: appVisualTokens.spacing.sm,
      backgroundColor: theme.colors.background
    },
    emptyStateTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.textPrimary
    },
    emptyStateBody: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary,
      textAlign: 'center'
    },
    emptyStateButton: {
      marginTop: 8,
      borderRadius: appVisualTokens.radii.lg,
      backgroundColor: theme.colors.brandBlue,
      paddingHorizontal: 18,
      paddingVertical: 14
    },
    emptyStateButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.surface
    },
    errorText: {
      fontSize: 13,
      lineHeight: 20,
      color: theme.colors.danger
    }
  });
}
