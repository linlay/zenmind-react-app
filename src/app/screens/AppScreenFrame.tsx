import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { appVisualTokens } from '../../shared/visual/foundation';

type AppScreenFrameProps = {
  eyebrow: string;
  title: string;
  description: string;
  accentColor: string;
  children?: ReactNode;
};

export function AppScreenFrame({
  eyebrow,
  title,
  description,
  accentColor,
  children,
}: AppScreenFrameProps) {
  const tabBarHeight = useBottomTabBarHeight();
  const hasChildren = children !== undefined && children !== null;
  const contentBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <ScreenHeader title={title} />
      </SafeAreaView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introSection}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.accentDot, { backgroundColor: accentColor }]} />
            <Text style={[styles.eyebrow, { color: accentColor }]}>{eyebrow}</Text>
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>

        {hasChildren ? (
          children
        ) : (
          <View style={styles.placeholderBlock}>
            <Text style={styles.cardEyebrow}>预留区域</Text>
            <Text style={styles.cardTitle}>当前页面先保留扁平化占位结构。</Text>
            <Text style={styles.cardBody}>
              后续接入真实内容时，继续沿用固定 Header 和轻量列表化编排。
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appVisualTokens.colors.surface,
  },
  headerSafeArea: {
    backgroundColor: appVisualTokens.colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: appVisualTokens.spacing.xl,
    paddingTop: appVisualTokens.spacing.lg,
    gap: appVisualTokens.spacing.xl,
  },
  introSection: {
    gap: appVisualTokens.spacing.sm,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: appVisualTokens.spacing.sm,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: appVisualTokens.radii.pill,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: appVisualTokens.colors.textSecondary,
  },
  placeholderBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appVisualTokens.colors.line,
    paddingTop: appVisualTokens.spacing.lg,
    gap: appVisualTokens.spacing.sm,
  },
  cardEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: appVisualTokens.colors.brandBlue,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
    color: appVisualTokens.colors.textSecondary,
  },
});
