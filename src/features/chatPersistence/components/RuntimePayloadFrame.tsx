import { memo, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { appVisualTokens } from '../../../shared/visual/foundation';

type RuntimePayloadFrameProps = {
  descriptorId: string;
  copyText: string;
  defaultWrap: boolean;
  onCopyText: (text: string) => void;
  renderContent: (wrap: boolean) => ReactNode;
};

const RuntimeCopyButton = memo(function RuntimeCopyButton({
  copyText,
  onCopyText,
}: {
  copyText: string;
  onCopyText: (text: string) => void;
}) {
  const handleCopy = useCallback(() => {
    onCopyText(copyText);
  }, [copyText, onCopyText]);

  return (
    <Pressable
      accessibilityLabel="复制内容"
      accessibilityRole="button"
      onPress={handleCopy}
      style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
    >
      <AppIcon usage="runtime.copy" color={appVisualTokens.colors.textSecondary} />
    </Pressable>
  );
});

export const RuntimePayloadFrame = memo(function RuntimePayloadFrame({
  descriptorId,
  copyText,
  defaultWrap,
  onCopyText,
  renderContent,
}: RuntimePayloadFrameProps) {
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
          accessibilityLabel={wrap ? '关闭自动换行' : '开启自动换行'}
          accessibilityRole="button"
          onPress={handleToggleWrap}
          style={({ pressed }) => [
            styles.iconButton,
            wrap && styles.iconButtonActive,
            pressed && styles.iconButtonPressed,
          ]}
        >
          <AppIcon
            usage="runtime.wrap"
            color={wrap ? appVisualTokens.colors.brandBlue : appVisualTokens.colors.textSecondary}
          />
        </Pressable>
        {copyText ? <RuntimeCopyButton copyText={copyText} onCopyText={onCopyText} /> : null}
      </View>

      {wrap ? (
        <View style={styles.wrapContent}>{content}</View>
      ) : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={styles.nowrapScroller}
        >
          <View style={styles.nowrapContent}>{content}</View>
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    marginTop: 8,
    borderRadius: appVisualTokens.radii.sm,
    backgroundColor: appVisualTokens.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 10,
  },
  toolbar: {
    minHeight: 22,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: appVisualTokens.spacing.xs,
    marginBottom: 5,
  },
  iconButton: {
    width: 24,
    height: 24,
    borderRadius: appVisualTokens.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
  },
  iconButtonPressed: {
    opacity: 0.7,
  },
  wrapContent: {
    minWidth: 0,
  },
  nowrapScroller: {
    alignSelf: 'stretch',
  },
  nowrapContent: {
    minWidth: 720,
  },
});
