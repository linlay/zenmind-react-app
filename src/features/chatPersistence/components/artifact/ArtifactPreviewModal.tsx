import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AuthenticatedResourceError,
  fetchAuthenticatedResourceText
} from '../../../../core/api/services/authenticatedResource.ts';
import type { ApiUriSource } from '../../../../core/api/apiClient.ts';
import { AppIcon } from '../../../../shared/icons/AppIcon.tsx';
import { useT } from '../../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../../shared/visual/AppThemeProvider.tsx';
import type { ChatTimelineArtifactNode } from '../../../chatTimeline/index.ts';
import { ArtifactPdfPreview } from './ArtifactPdfPreview.tsx';
import { useAuthenticatedResourceSource } from './useAuthenticatedResourceSource.ts';

type ArtifactPreviewModalProps = {
  node: ChatTimelineArtifactNode;
  visible: boolean;
  downloadBusy: boolean;
  downloadFeedback: string;
  onClose: () => void;
  onDownload: () => void;
};

const HEADER_CLASS = 'min-h-[56px] flex-row items-center gap-app-sm border-b border-app-line px-app-md';
const TITLE_CLASS = 'min-w-0 flex-1 text-app-body font-bold text-app-primary';
const CLOSE_CLASS = 'h-10 w-10 items-center justify-center rounded-app-pill active:bg-app-surface-muted';
const CONTENT_CLASS = 'flex-1 bg-app-background';
const CENTER_CLASS = 'flex-1 items-center justify-center gap-app-sm px-app-lg';
const ERROR_TEXT_CLASS = 'text-center text-app-body font-semibold text-app-danger';
const RETRY_CLASS = 'min-h-[38px] flex-row items-center gap-app-xs rounded-app-pill bg-app-action px-app-md';
const RETRY_TEXT_CLASS = 'text-app-footnote font-bold text-app-brand-blue';
const TEXT_CONTENT_CLASS = 'font-mono text-[13px] leading-5 text-app-primary';
const TEXT_SCROLLER_CONTENT_CLASS = 'px-app-md py-app-md';
const FOOTER_CLASS = 'gap-app-xs border-t border-app-line bg-app-surface px-app-md py-app-sm';
const DOWNLOAD_CLASS =
  'min-h-[42px] flex-row items-center justify-center gap-app-xs rounded-app-md bg-app-action px-app-md active:opacity-[0.72]';
const DOWNLOAD_DISABLED_CLASS = 'opacity-[0.45]';
const DOWNLOAD_TEXT_CLASS = 'text-app-body font-bold text-app-brand-blue';
const FEEDBACK_CLASS = 'text-center text-app-caption text-app-secondary';

const ArtifactTextPreview = memo(function ArtifactTextPreview({
  source,
  retryNonce,
  onError
}: {
  source: ApiUriSource;
  retryNonce: number;
  onError: (message: string) => void;
}) {
  const { theme } = useAppTheme();
  const t = useT();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setText('');
    setLoading(true);
    void fetchAuthenticatedResourceText(source, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setText(value);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoading(false);
          onError(
            error instanceof AuthenticatedResourceError && error.code === 'too_large'
              ? t('artifact.previewTooLarge')
              : error instanceof AuthenticatedResourceError && error.code === 'timed_out'
                ? t('artifact.previewTimedOut')
                : t('artifact.previewFailed')
          );
        }
      });
    return () => controller.abort();
  }, [onError, retryNonce, source, t]);

  if (loading) {
    return (
      <View className={CENTER_CLASS}>
        <ActivityIndicator color={theme.colors.brandBlue} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerClassName={TEXT_SCROLLER_CONTENT_CLASS}>
      <Text allowFontScaling={false} selectable className={TEXT_CONTENT_CLASS}>
        {text}
      </Text>
    </ScrollView>
  );
});

export const ArtifactPreviewModal = memo(function ArtifactPreviewModal({
  node,
  visible,
  downloadBusy,
  downloadFeedback,
  onClose,
  onDownload
}: ArtifactPreviewModalProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const [previewError, setPreviewError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const sourceState = useAuthenticatedResourceSource(node.resourceUrl, visible);
  const retrySource = sourceState.retry;

  useEffect(() => {
    setPreviewError('');
    setRetryNonce(0);
  }, [node.id, visible]);

  const handlePreviewError = useCallback((message: string) => {
    setPreviewError(message);
  }, []);
  const handleRetry = useCallback(() => {
    setPreviewError('');
    setRetryNonce((value) => value + 1);
    retrySource();
  }, [retrySource]);
  const errorMessage = previewError || (sourceState.error ? t('artifact.previewFailed') : '');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-app-surface" edges={['top', 'bottom']}>
        <View className={HEADER_CLASS}>
          <Text allowFontScaling={false} numberOfLines={1} className={TITLE_CLASS}>
            {node.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('artifact.closePreview')}
            onPress={onClose}
            className={CLOSE_CLASS}
          >
            <AppIcon usage="artifact.close" />
          </Pressable>
        </View>

        <View className={CONTENT_CLASS}>
          {errorMessage ? (
            <View className={CENTER_CLASS}>
              <Text allowFontScaling={false} selectable className={ERROR_TEXT_CLASS}>
                {errorMessage}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('artifact.retryPreview')}
                onPress={handleRetry}
                className={RETRY_CLASS}
              >
                <AppIcon usage="artifact.retry" />
                <Text allowFontScaling={false} className={RETRY_TEXT_CLASS}>
                  {t('artifact.retryPreview')}
                </Text>
              </Pressable>
            </View>
          ) : sourceState.loading || !sourceState.source ? (
            <View className={CENTER_CLASS}>
              <ActivityIndicator color={theme.colors.brandBlue} />
              <Text allowFontScaling={false} className="text-app-body text-app-secondary">
                {t('artifact.previewLoading')}
              </Text>
            </View>
          ) : node.previewKind === 'image' ? (
            <Image
              key={retryNonce}
              source={sourceState.source}
              resizeMode="contain"
              className="h-full w-full"
              onError={() => handlePreviewError(t('artifact.previewFailed'))}
            />
          ) : node.previewKind === 'text' ? (
            <ArtifactTextPreview source={sourceState.source} retryNonce={retryNonce} onError={handlePreviewError} />
          ) : node.previewKind === 'pdf' ? (
            <ArtifactPdfPreview
              key={retryNonce}
              source={sourceState.source}
              unavailableLabel={t('artifact.pdfUnavailable')}
              onError={handlePreviewError}
            />
          ) : (
            <View className={CENTER_CLASS}>
              <Text allowFontScaling={false} className="text-center text-app-body text-app-secondary">
                {t('artifact.unsupportedPreview')}
              </Text>
            </View>
          )}
        </View>

        <View className={FOOTER_CLASS}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('artifact.download')}
            disabled={downloadBusy}
            onPress={onDownload}
            className={[DOWNLOAD_CLASS, downloadBusy ? DOWNLOAD_DISABLED_CLASS : null].filter(Boolean).join(' ')}
          >
            {downloadBusy ? (
              <ActivityIndicator size="small" color={theme.colors.brandBlue} />
            ) : (
              <AppIcon usage="artifact.download" />
            )}
            <Text allowFontScaling={false} className={DOWNLOAD_TEXT_CLASS}>
              {downloadBusy ? t('artifact.downloading') : t('artifact.download')}
            </Text>
          </Pressable>
          {downloadFeedback ? (
            <Text allowFontScaling={false} className={FEEDBACK_CLASS}>
              {downloadFeedback}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
});
