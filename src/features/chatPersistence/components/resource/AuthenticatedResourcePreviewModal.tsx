import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AuthenticatedResourceError,
  fetchAuthenticatedResourceText
} from '../../../../core/api/services/authenticatedResource.ts';
import type { ApiUriSource } from '../../../../core/api/apiClient.ts';
import { AppIcon } from '../../../../shared/icons/AppIcon.tsx';
import { useT } from '../../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../../shared/visual/AppThemeProvider.tsx';
import {
  splitAuthenticatedResourceTextAtLine,
  type AuthenticatedResourcePreviewTarget
} from '../../authenticatedResourcePreview.ts';
import { AuthenticatedResourcePdfPreview } from './AuthenticatedResourcePdfPreview.tsx';
import type { AuthenticatedResourceDownloadState } from './useAuthenticatedResourceDownload.ts';
import { useAuthenticatedResourceSource } from './useAuthenticatedResourceSource.ts';

type AuthenticatedResourcePreviewModalProps = {
  target: AuthenticatedResourcePreviewTarget;
  visible: boolean;
  initialError?: string;
  downloadState: AuthenticatedResourceDownloadState;
  downloadFeedback: string;
  onClose: () => void;
  onDownload: () => void;
};

const HEADER_CLASS = 'min-h-[56px] flex-row items-center gap-app-sm border-b border-app-line px-app-md';
const HEADER_TEXT_CLASS = 'min-w-0 flex-1 py-app-xs';
const TITLE_CLASS = 'text-app-body font-bold text-app-primary';
const LOCATION_CLASS = 'font-mono text-[11px] leading-4 text-app-tertiary';
const CLOSE_CLASS = 'h-10 w-10 items-center justify-center rounded-app-pill active:bg-app-surface-muted';
const CONTENT_CLASS = 'flex-1 bg-app-background';
const CENTER_CLASS = 'flex-1 items-center justify-center gap-app-sm px-app-lg';
const ERROR_TEXT_CLASS = 'text-center text-app-body font-semibold text-app-danger';
const RETRY_CLASS = 'min-h-[38px] flex-row items-center gap-app-xs rounded-app-pill bg-app-action px-app-md';
const RETRY_TEXT_CLASS = 'text-app-footnote font-bold text-app-brand-blue';
const TEXT_CONTENT_CLASS = 'font-mono text-[13px] leading-5 text-app-primary';
const TEXT_TARGET_CLASS = 'bg-app-action font-mono text-[13px] leading-5 text-app-primary';
const TEXT_SCROLLER_CONTENT_CLASS = 'px-app-md py-app-md';
const FOOTER_CLASS = 'gap-app-xs border-t border-app-line bg-app-surface px-app-md py-app-sm';
const DOWNLOAD_CLASS =
  'min-h-[42px] flex-row items-center justify-center gap-app-xs rounded-app-md bg-app-action px-app-md active:opacity-[0.72]';
const DOWNLOAD_DISABLED_CLASS = 'opacity-[0.45]';
const DOWNLOAD_TEXT_CLASS = 'text-app-body font-bold text-app-brand-blue';
const FEEDBACK_CLASS = 'text-center text-app-caption text-app-secondary';

const AuthenticatedResourceTextPreview = memo(function AuthenticatedResourceTextPreview({
  source,
  line,
  retryNonce,
  onError
}: {
  source: ApiUriSource;
  line?: number;
  retryNonce: number;
  onError: (message: string) => void;
}) {
  const { theme } = useAppTheme();
  const t = useT();
  const scrollRef = useRef<ScrollView>(null);
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

  const sections = useMemo(() => splitAuthenticatedResourceTextAtLine(text, line), [line, text]);
  const handleTargetLayout = useCallback((event: LayoutChangeEvent) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 72), animated: false });
  }, []);

  if (loading) {
    return (
      <View className={CENTER_CLASS}>
        <ActivityIndicator color={theme.colors.brandBlue} />
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName={TEXT_SCROLLER_CONTENT_CLASS}>
      {sections ? (
        <View>
          {sections.before ? (
            <Text allowFontScaling={false} selectable className={TEXT_CONTENT_CLASS}>
              {sections.before}
            </Text>
          ) : null}
          <View onLayout={handleTargetLayout}>
            <Text allowFontScaling={false} selectable className={TEXT_TARGET_CLASS}>
              {sections.target || ' '}
            </Text>
          </View>
          {sections.after ? (
            <Text allowFontScaling={false} selectable className={TEXT_CONTENT_CLASS}>
              {sections.after}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text allowFontScaling={false} selectable className={TEXT_CONTENT_CLASS}>
          {text}
        </Text>
      )}
    </ScrollView>
  );
});

export const AuthenticatedResourcePreviewModal = memo(function AuthenticatedResourcePreviewModal({
  target,
  visible,
  initialError = '',
  downloadState,
  downloadFeedback,
  onClose,
  onDownload
}: AuthenticatedResourcePreviewModalProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const [previewError, setPreviewError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const canPreview = target.previewKind !== 'unsupported' && !initialError;
  const canDownload = Boolean(target.resourceUrl) && !initialError;
  const sourceState = useAuthenticatedResourceSource(target.resourceUrl, visible && canPreview);
  const retrySource = sourceState.retry;

  useEffect(() => {
    setPreviewError('');
    setRetryNonce(0);
  }, [target.key, visible]);

  const handlePreviewError = useCallback((message: string) => {
    setPreviewError(message);
  }, []);
  const handleRetry = useCallback(() => {
    setPreviewError('');
    if (sourceState.error) {
      retrySource();
      return;
    }
    setRetryNonce((value) => value + 1);
  }, [retrySource, sourceState.error]);
  const sourceLocation = target.sourcePath ? `${target.sourcePath}${target.line ? `:${target.line}` : ''}` : '';
  const errorMessage = initialError || previewError || (sourceState.error ? t('artifact.previewFailed') : '');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-app-surface" edges={['top', 'bottom']}>
        <View className={HEADER_CLASS}>
          <View className={HEADER_TEXT_CLASS}>
            <Text allowFontScaling={false} numberOfLines={1} className={TITLE_CLASS}>
              {target.name}
            </Text>
            {sourceLocation ? (
              <Text allowFontScaling={false} numberOfLines={1} className={LOCATION_CLASS}>
                {sourceLocation}
              </Text>
            ) : null}
          </View>
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
              {!initialError ? (
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
              ) : null}
            </View>
          ) : target.previewKind === 'unsupported' ? (
            <View className={CENTER_CLASS}>
              <Text allowFontScaling={false} className="text-center text-app-body text-app-secondary">
                {t('artifact.unsupportedPreview')}
              </Text>
            </View>
          ) : sourceState.loading || !sourceState.source ? (
            <View className={CENTER_CLASS}>
              <ActivityIndicator color={theme.colors.brandBlue} />
              <Text allowFontScaling={false} className="text-app-body text-app-secondary">
                {t('artifact.previewLoading')}
              </Text>
            </View>
          ) : target.previewKind === 'image' ? (
            <Image
              key={retryNonce}
              source={sourceState.source}
              resizeMode="contain"
              className="h-full w-full"
              onError={() => handlePreviewError(t('artifact.previewFailed'))}
            />
          ) : target.previewKind === 'text' ? (
            <AuthenticatedResourceTextPreview
              source={sourceState.source}
              line={target.line}
              retryNonce={retryNonce}
              onError={handlePreviewError}
            />
          ) : (
            <AuthenticatedResourcePdfPreview
              key={retryNonce}
              source={sourceState.source}
              unavailableLabel={t('artifact.pdfUnavailable')}
              onError={handlePreviewError}
            />
          )}
        </View>

        {canDownload ? (
          <View className={FOOTER_CLASS}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('artifact.download')}
              disabled={downloadState === 'loading'}
              onPress={onDownload}
              className={[DOWNLOAD_CLASS, downloadState === 'loading' ? DOWNLOAD_DISABLED_CLASS : null]
                .filter(Boolean)
                .join(' ')}
            >
              {downloadState === 'loading' ? (
                <ActivityIndicator size="small" color={theme.colors.brandBlue} />
              ) : (
                <AppIcon usage="artifact.download" />
              )}
              <Text allowFontScaling={false} className={DOWNLOAD_TEXT_CLASS}>
                {downloadState === 'loading' ? t('artifact.downloading') : t('artifact.download')}
              </Text>
            </Pressable>
            {downloadFeedback ? (
              <Text allowFontScaling={false} className={FEEDBACK_CLASS}>
                {downloadFeedback}
              </Text>
            ) : null}
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
});
