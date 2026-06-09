import { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { buildApiUrl } from '../../../core/api/apiClient';
import { useT } from '../../../shared/i18n';
import { AppLineIcon } from '../../../shared/visual/AppLineIcon';
import { appVisualTokens } from '../../../shared/visual/foundation';
import { formatChatAttachmentSize, getChatAttachmentStatusLabel } from '../chatAttachmentModels';
import type { ChatAttachmentBase } from '../types';

type ChatAttachmentStripProps = {
  attachments: readonly ChatAttachmentBase[];
  variant: 'composer' | 'message';
  onRemoveAttachment?: (attachmentId: string) => void;
  onRetryAttachment?: (attachmentId: string) => void;
};

function resolveImageUri(attachment: ChatAttachmentBase, variant: 'composer' | 'message'): string {
  const localUri = attachment.previewUri || attachment.localUri;
  const uri =
    variant === 'message' ? localUri || attachment.resourceUrl || '' : localUri || attachment.resourceUrl || '';
  if (!uri || /^(file|content|data|https?):\/\//.test(uri)) {
    return uri;
  }
  if (uri.startsWith('/')) {
    try {
      return buildApiUrl(uri);
    } catch {
      return uri;
    }
  }
  return uri;
}

const AttachmentImageTile = memo(function AttachmentImageTile({
  attachment,
  variant
}: {
  attachment: ChatAttachmentBase;
  variant: 'composer' | 'message';
}) {
  const t = useT();
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [retrySeed, setRetrySeed] = useState(0);
  const imageUri = resolveImageUri(attachment, variant);
  const imageSource = useMemo(() => (imageUri ? { uri: imageUri } : null), [imageUri]);
  const isMessage = variant === 'message';
  const frameStyle = isMessage ? styles.messageImageFrame : styles.composerImageFrame;

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
          key={`${imageUri}:${retrySeed}`}
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
            <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
          ) : (
            <>
              <AppLineIcon
                name="image"
                size={appVisualTokens.iconSizes.md}
                color={appVisualTokens.colors.textSecondary}
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
  variant
}: {
  attachment: ChatAttachmentBase;
  variant: 'composer' | 'message';
}) {
  const t = useT();
  const sizeText = formatChatAttachmentSize(attachment.sizeBytes);
  const statusText =
    variant === 'composer' && attachment.status !== 'ready' ? getChatAttachmentStatusLabel(attachment.status, t) : '';
  return (
    <View style={[styles.fileTile, variant === 'message' && styles.messageFileTile]}>
      <View style={styles.fileIconWrap}>
        <AppLineIcon name="file" size={appVisualTokens.iconSizes.sm} color={appVisualTokens.colors.brandBlue} />
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

export const ChatAttachmentStrip = memo(function ChatAttachmentStrip({
  attachments,
  variant,
  onRemoveAttachment,
  onRetryAttachment
}: ChatAttachmentStripProps) {
  const t = useT();

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
        const showActions = variant === 'composer';
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
              <AttachmentImageTile attachment={attachment} variant={variant} />
            ) : (
              <AttachmentFileTile attachment={attachment} variant={variant} />
            )}
            {showActions && attachment.status === 'uploading' ? (
              <View style={styles.statusBadge}>
                <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
              </View>
            ) : null}
            {showActions && attachment.status === 'failed' ? (
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
            {showActions ? (
              <Pressable
                onPress={() => onRemoveAttachment?.(attachment.attachmentId)}
                style={styles.removeButton}
                accessibilityRole="button"
                accessibilityLabel={t('attachment.remove', { name: attachment.name })}
              >
                <AppLineIcon name="close" size={12} color={appVisualTokens.colors.textPrimary} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  stripContent: {
    gap: appVisualTokens.spacing.sm,
    paddingHorizontal: appVisualTokens.spacing.xs,
    paddingVertical: 2
  },
  messageStripContent: {
    paddingHorizontal: 0,
    paddingTop: appVisualTokens.spacing.sm
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
    borderColor: appVisualTokens.colors.line,
    backgroundColor: appVisualTokens.colors.backgroundMuted
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
    backgroundColor: appVisualTokens.colors.backgroundMuted
  },
  imageErrorText: {
    maxWidth: 116,
    fontSize: 11,
    color: appVisualTokens.colors.textSecondary
  },
  fileTile: {
    width: 184,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
    borderRadius: appVisualTokens.radii.md,
    borderWidth: 1,
    borderColor: appVisualTokens.colors.line,
    backgroundColor: appVisualTokens.colors.surface,
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
    backgroundColor: appVisualTokens.colors.backgroundMuted
  },
  fileTextWrap: {
    minWidth: 0,
    flex: 1
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    color: appVisualTokens.colors.textPrimary
  },
  fileMeta: {
    marginTop: 2,
    fontSize: 11,
    color: appVisualTokens.colors.textTertiary
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
    backgroundColor: appVisualTokens.colors.surface
  },
  retryButton: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.surface,
    paddingHorizontal: appVisualTokens.spacing.sm,
    paddingVertical: 3
  },
  retryText: {
    fontSize: 11,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlue
  },
  removeButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: appVisualTokens.radii.pill,
    borderWidth: 1,
    borderColor: appVisualTokens.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appVisualTokens.colors.surface
  }
});
