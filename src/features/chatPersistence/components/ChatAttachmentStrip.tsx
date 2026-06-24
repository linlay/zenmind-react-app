import { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  buildAuthenticatedApiUriSource,
  type ApiUriSource,
} from '../../../core/api/apiClient';
import { useT } from '../../../shared/i18n';
import { AppLineIcon } from '../../../shared/visual/AppLineIcon';
import { useAppTheme, useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import {
  formatChatAttachmentSize,
  getChatAttachmentStatusLabel,
  normalizeChatAttachmentResourceUrl
} from '../chatAttachmentModels';
import type { ChatAttachmentBase } from '../types';

type ChatAttachmentStripProps = {
  attachments: readonly ChatAttachmentBase[];
  variant: 'composer' | 'message';
  onRemoveAttachment?: (attachmentId: string) => void;
  onRetryAttachment?: (attachmentId: string) => void;
};

type ChatAttachmentStripStyles = ReturnType<typeof createStyles>;
type ChatAttachmentVariant = ChatAttachmentStripProps['variant'];
type ChatAttachmentTranslate = ReturnType<typeof useT>;

function resolveImageUri({
  localUri,
  previewUri,
  resourceUrl,
  variant
}: Pick<ChatAttachmentBase, 'localUri' | 'previewUri' | 'resourceUrl'> & {
  variant: ChatAttachmentVariant;
}): string {
  const localPreviewUri = previewUri || localUri;
  const uri = variant === 'message' ? resourceUrl || localPreviewUri || '' : localPreviewUri || resourceUrl || '';
  return normalizeChatAttachmentResourceUrl(uri);
}

const AttachmentImageTile = memo(function AttachmentImageTile({
  attachment,
  variant,
  styles,
  theme,
  t
}: {
  attachment: ChatAttachmentBase;
  variant: ChatAttachmentVariant;
  styles: ChatAttachmentStripStyles;
  theme: AppThemeTokens;
  t: ChatAttachmentTranslate;
}) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [retrySeed, setRetrySeed] = useState(0);
  const [imageSource, setImageSource] = useState<ApiUriSource | null>(null);
  const imageUri = useMemo(
    () =>
      resolveImageUri({
        localUri: attachment.localUri,
        previewUri: attachment.previewUri,
        resourceUrl: attachment.resourceUrl,
        variant
      }),
    [attachment.localUri, attachment.previewUri, attachment.resourceUrl, variant]
  );
  const isMessage = variant === 'message';
  const frameStyle = isMessage ? styles.messageImageFrame : styles.composerImageFrame;

  useEffect(() => {
    let cancelled = false;

    async function resolveSource() {
      if (!imageUri) {
        if (!cancelled) {
          setImageSource(null);
          setLoadState('failed');
        }
        return;
      }

      if (!cancelled) {
        setLoadState('loading');
      }

      try {
        const source = await buildAuthenticatedApiUriSource(imageUri);
        if (!cancelled) {
          setImageSource(source);
        }
      } catch {
        if (!cancelled) {
          setImageSource({ uri: imageUri });
        }
      }
    }

    void resolveSource();
    return () => {
      cancelled = true;
    };
  }, [imageUri, retrySeed]);

  return (
    <Pressable
      onPress={() => {
        if (loadState === 'failed') {
          setLoadState('loading');
          setRetrySeed((value) => value + 1);
        }
      }}
      disabled={loadState !== 'failed'}
      style={[styles.imageTile, frameStyle]}
      accessibilityRole={loadState === 'failed' ? 'button' : 'image'}
      accessibilityLabel={attachment.name}
    >
      {imageSource ? (
        <Image
          key={`${imageSource.uri}:${retrySeed}`}
          source={imageSource}
          resizeMode="cover"
          style={styles.image}
          onLoadStart={() => setLoadState('loading')}
          onLoad={() => setLoadState('loaded')}
          onError={() => setLoadState('failed')}
        />
      ) : null}
      {loadState !== 'loaded' ? (
        <View style={styles.imageOverlay}>
          {loadState === 'loading' ? (
            <ActivityIndicator size="small" color={theme.colors.brandBlue} />
          ) : (
            <>
              <AppLineIcon
                name="image"
                size={appVisualTokens.iconSizes.md}
                color={theme.colors.textSecondary}
              />
              <Text allowFontScaling={false} numberOfLines={1} style={styles.imageErrorText}>
                {t('attachment.imageLoadFailed')}
              </Text>
            </>
          )}
        </View>
      ) : null}
    </Pressable>
  );
});

const AttachmentFileTile = memo(function AttachmentFileTile({
  attachment,
  variant,
  styles,
  theme,
  t
}: {
  attachment: ChatAttachmentBase;
  variant: ChatAttachmentVariant;
  styles: ChatAttachmentStripStyles;
  theme: AppThemeTokens;
  t: ChatAttachmentTranslate;
}) {
  const sizeText = formatChatAttachmentSize(attachment.sizeBytes);
  const statusText =
    variant === 'composer' && attachment.status !== 'ready' ? getChatAttachmentStatusLabel(attachment.status, t) : '';
  return (
    <View style={[styles.fileTile, variant === 'message' && styles.messageFileTile]}>
      <View style={styles.fileIconWrap}>
        <AppLineIcon name="file" size={appVisualTokens.iconSizes.sm} color={theme.colors.brandBlue} />
      </View>
      <View style={styles.fileTextWrap}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.fileName}>
          {attachment.name}
        </Text>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.fileMeta}>
          {[statusText, sizeText].filter(Boolean).join(' · ') || t('attachment.file')}
        </Text>
      </View>
    </View>
  );
});

const ComposerAttachmentActions = memo(function ComposerAttachmentActions({
  attachment,
  onRemoveAttachment,
  onRetryAttachment,
  styles,
  theme,
  t
}: {
  attachment: ChatAttachmentBase;
  onRemoveAttachment?: (attachmentId: string) => void;
  onRetryAttachment?: (attachmentId: string) => void;
  styles: ChatAttachmentStripStyles;
  theme: AppThemeTokens;
  t: ChatAttachmentTranslate;
}) {
  return (
    <>
      {attachment.status === 'uploading' ? (
        <View style={styles.statusBadge}>
          <ActivityIndicator size="small" color={theme.colors.brandBlue} />
        </View>
      ) : null}
      {attachment.status === 'failed' ? (
        <Pressable
          onPress={() => onRetryAttachment?.(attachment.attachmentId)}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel={t('attachment.retryUpload', { name: attachment.name })}
        >
          <Text allowFontScaling={false} style={styles.retryText}>
            {t('attachment.retry')}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => onRemoveAttachment?.(attachment.attachmentId)}
        style={styles.removeButton}
        accessibilityRole="button"
        accessibilityLabel={t('attachment.remove', { name: attachment.name })}
      >
        <AppLineIcon name="close" size={12} color={theme.colors.textPrimary} />
      </Pressable>
    </>
  );
});

export const ChatAttachmentStrip = memo(function ChatAttachmentStrip({
  attachments,
  variant,
  onRemoveAttachment,
  onRetryAttachment
}: ChatAttachmentStripProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      bounces={false}
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.stripContent, variant === 'message' && styles.messageStripContent]}
    >
      {attachments.map((attachment) => {
        return (
          <View
            key={attachment.attachmentId}
            style={[
              styles.attachmentShell,
              variant === 'message' && styles.messageAttachmentShell,
              attachment.status === 'failed' && styles.attachmentFailed
            ]}
          >
            {attachment.kind === 'image' ? (
              <AttachmentImageTile attachment={attachment} variant={variant} styles={styles} theme={theme} t={t} />
            ) : (
              <AttachmentFileTile attachment={attachment} variant={variant} styles={styles} theme={theme} t={t} />
            )}
            {variant === 'composer' ? (
              <ComposerAttachmentActions
                attachment={attachment}
                onRemoveAttachment={onRemoveAttachment}
                onRetryAttachment={onRetryAttachment}
                styles={styles}
                theme={theme}
                t={t}
              />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    stripContent: {
      gap: appVisualTokens.spacing.sm,
      paddingHorizontal: appVisualTokens.spacing.xs,
      paddingVertical: 2
    },
    messageStripContent: {
      paddingHorizontal: 0,
      paddingTop: 0
    },
    attachmentShell: {
      position: 'relative',
      borderRadius: appVisualTokens.radii.md
    },
    messageAttachmentShell: {
      maxWidth: 210
    },
    attachmentFailed: {
      opacity: 0.86
    },
    imageTile: {
      overflow: 'hidden',
      borderRadius: appVisualTokens.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.backgroundMuted
    },
    composerImageFrame: {
      width: 58,
      height: 58
    },
    messageImageFrame: {
      width: 168,
      height: 118
    },
    image: {
      width: '100%',
      height: '100%'
    },
    imageOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: appVisualTokens.spacing.xs,
      backgroundColor: theme.colors.backgroundMuted
    },
    imageErrorText: {
      maxWidth: 116,
      fontSize: 11,
      color: theme.colors.textSecondary
    },
    fileTile: {
      width: 184,
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm,
      borderRadius: appVisualTokens.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      padding: appVisualTokens.spacing.sm
    },
    messageFileTile: {
      width: 210
    },
    fileIconWrap: {
      width: 32,
      height: 32,
      borderRadius: appVisualTokens.radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundMuted
    },
    fileTextWrap: {
      minWidth: 0,
      flex: 1
    },
    fileName: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textPrimary
    },
    fileMeta: {
      marginTop: 2,
      fontSize: 11,
      color: theme.colors.textTertiary
    },
    statusBadge: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      width: 24,
      height: 24,
      borderRadius: appVisualTokens.radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface
    },
    retryButton: {
      position: 'absolute',
      left: 6,
      bottom: 6,
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: appVisualTokens.spacing.sm,
      paddingVertical: 3
    },
    retryText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.brandBlue
    },
    removeButton: {
      position: 'absolute',
      top: -5,
      right: -5,
      width: 20,
      height: 20,
      borderRadius: appVisualTokens.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface
    }
  });
}
