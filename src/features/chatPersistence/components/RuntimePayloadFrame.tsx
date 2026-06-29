import { memo, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';

type RuntimePayloadFrameProps = {
  descriptorId: string;
  copyText: string;
  defaultWrap: boolean;
  onCopyText: (text: string) => void;
  renderContent: (wrap: boolean) => ReactNode;
};

const RuntimeCopyButton = memo(function RuntimeCopyButton({
  copyText,
  onCopyText
}: {
  copyText: string;
  onCopyText: (text: string) => void;
}) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const handleCopy = useCallback(() => {
    onCopyText(copyText);
  }, [copyText, onCopyText]);

  return (
    <Pressable
      accessibilityLabel={t('timeline.copy')}
      accessibilityRole="button"
      onPress={handleCopy}
      style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
    >
      <AppIcon usage="runtime.copy" color={theme.colors.textSecondary} />
    </Pressable>
  );
});

export const RuntimePayloadFrame = memo(function RuntimePayloadFrame({
  descriptorId,
  copyText,
  defaultWrap,
  onCopyText,
  renderContent
}: RuntimePayloadFrameProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const [wrap, setWrap] = useState(defaultWrap);

  useEffect(() => {
    setWrap(defaultWrap);
  }, [descriptorId, defaultWrap]);

  const handleToggleWrap = useCallback(() => setWrap((value) => !value), []);

  const content = renderContent(wrap);

  return (
    <View style={styles.frame}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityLabel={wrap ? t('timeline.wrapOff') : t('timeline.wrapOn')}
          accessibilityRole="button"
          onPress={handleToggleWrap}
          style={({ pressed }) => [
            styles.iconButton,
            wrap && styles.iconButtonActive,
            pressed && styles.iconButtonPressed
          ]}
        >
          <AppIcon
            usage={wrap ? 'runtime.wrapEnabled' : 'runtime.wrapDisabled'}
            color={wrap ? theme.colors.brandBlue : theme.colors.textSecondary}
          />
        </Pressable>
        {copyText ? <RuntimeCopyButton copyText={copyText} onCopyText={onCopyText} /> : null}
      </View>

      {wrap ? (
        <View style={styles.wrapContent}>{content}</View>
      ) : (
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={styles.nowrapScroller}>
          <View style={styles.nowrapContent}>{content}</View>
        </ScrollView>
      )}
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    frame: {
      marginTop: 8,
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingTop: 7,
      paddingBottom: 10
    },
    toolbar: {
      minHeight: 22,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: appVisualTokens.spacing.xs,
      marginBottom: 5
    },
    iconButton: {
      width: 24,
      height: 24,
      borderRadius: appVisualTokens.radii.sm,
      alignItems: 'center',
      justifyContent: 'center'
    },
    iconButtonActive: {
      backgroundColor: theme.colors.brandBlueSoft
    },
    iconButtonPressed: {
      opacity: 0.7
    },
    wrapContent: {
      minWidth: 0
    },
    nowrapScroller: {
      alignSelf: 'stretch'
    },
    nowrapContent: {
      minWidth: 720
    }
  });
}
