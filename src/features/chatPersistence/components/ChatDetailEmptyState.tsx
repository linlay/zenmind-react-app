import { Pressable, StyleSheet, Text, View } from 'react-native';

import { appVisualTokens } from '../../../shared/visual/foundation';

type ChatDetailEmptyStateProps = {
  errorText?: string;
  onBack: () => void;
  onRetry?: () => void;
};

export function ChatDetailEmptyState({ errorText, onBack, onRetry }: ChatDetailEmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>会话暂不可用</Text>
      <Text style={styles.emptyStateBody}>当前会话未能从本地 SQLite 成功读取。</Text>
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.emptyStateButton}>
          <Text style={styles.emptyStateButtonText}>重试</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onBack} style={styles.emptyStateButton}>
        <Text style={styles.emptyStateButtonText}>返回列表</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: appVisualTokens.spacing.sm,
    backgroundColor: appVisualTokens.colors.background,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  emptyStateBody: {
    fontSize: 15,
    lineHeight: 22,
    color: appVisualTokens.colors.textSecondary,
    textAlign: 'center',
  },
  emptyStateButton: {
    marginTop: 8,
    borderRadius: appVisualTokens.radii.lg,
    backgroundColor: appVisualTokens.colors.brandBlue,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: appVisualTokens.colors.surface,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    color: appVisualTokens.colors.danger,
  },
});
