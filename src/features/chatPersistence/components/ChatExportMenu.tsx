import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCloudAuthSnapshot, subscribeCloudAuth } from '../../../core/auth/cloudAuth.ts';
import { fetchChatExport, getChatExportAssetOrigin } from '../../../core/api/services/chatExport.ts';
import { deliverChatExport } from '../../../core/api/services/chatExportDelivery';
import { ChatExportError, type ChatExportFormat } from '../../../core/api/services/chatExportProtocol.ts';
import { useT } from '../../../shared/i18n';
import { getChatSourceFromId, getRemoteChatSourceId } from '../chatSource.ts';

/** Independent of the streaming timeline: mount the panel and fetch only after explicit action. */
export const ChatExportMenu = memo(function ChatExportMenu({
  conversationId,
  disabled
}: {
  conversationId: string;
  disabled: boolean;
}) {
  const t = useT(),
    insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const cloud = useSyncExternalStore(subscribeCloudAuth, getCloudAuthSnapshot, getCloudAuthSnapshot);
  const identity = `${conversationId}:${cloud.scopeId}:${cloud.generation}`;
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  useEffect(() => {
    latestIdentity.current = identity;
    setOpen(false);
    setBusy(false);
    setError('');
    return () => {
      request.current?.abort();
      latestIdentity.current = '';
    };
  }, [identity, disabled]);
  const close = () => {
    request.current?.abort();
    setOpen(false);
    setError('');
  };
  const run = async (format: ChatExportFormat, action: 'save' | 'share') => {
    if (disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const source = getChatSourceFromId(conversationId);
      const file = await fetchChatExport({
        sourceKind: source.kind,
        sourceId: source.sourceId,
        chatId: getRemoteChatSourceId(conversationId),
        format,
        signal: controller.signal
      });
      if (controller.signal.aborted || latestIdentity.current !== identity) return;
      await deliverChatExport(file, action, controller.signal);
      if (!controller.signal.aborted && latestIdentity.current === identity) setOpen(false);
    } catch (cause) {
      if (!controller.signal.aborted && latestIdentity.current === identity) {
        if (
          (cause instanceof Error && cause.name === 'AbortError') ||
          (cause instanceof ChatExportError && cause.code === 'cancelled')
        )
          setError('');
        else
          setError(
            t(
              cause instanceof ChatExportError && cause.code === 'unavailable'
                ? 'chatExport.unavailable'
                : cause instanceof ChatExportError && cause.code === 'too_large'
                  ? 'chatExport.tooLarge'
                  : 'chatExport.failed'
            )
          );
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (latestIdentity.current === identity) setBusy(false);
      }
    }
  };
  const htmlAvailable = Boolean(getChatExportAssetOrigin());
  return (
    <View className="items-end px-app-lg">
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        className="min-h-[32px] justify-center"
      >
        <Text className="text-app-caption text-app-secondary">{t('chatExport.title')}</Text>
      </Pressable>
      {open ? (
        <Modal transparent animationType="fade" onRequestClose={close}>
          <View className="flex-1 justify-end bg-app-overlay">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chatExport.close')}
              onPress={close}
              className="flex-1"
            />
            <View
              className="gap-app-sm bg-app-surface px-app-lg pt-app-lg"
              style={{ paddingBottom: insets.bottom + 16 }}
            >
              <Text className="text-app-title-sm font-semibold text-app-primary">{t('chatExport.title')}</Text>
              <Text className="text-app-footnote text-app-secondary">{t('chatExport.scope')}</Text>
              {!htmlAvailable ? (
                <Text className="text-app-caption text-app-secondary">{t('chatExport.htmlUnavailable')}</Text>
              ) : null}
              {(['markdown', 'html'] as const)
                .filter((format) => format !== 'html' || htmlAvailable)
                .map((format) => (
                  <View key={format} className="flex-row gap-app-md">
                    {(['save', 'share'] as const).map((action) => (
                      <Pressable
                        key={action}
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => void run(format, action)}
                        className="min-h-[44px] flex-1 items-center justify-center rounded-app-md bg-app-surface-muted"
                      >
                        <Text className="text-app-body text-app-primary">
                          {t(action === 'save' ? 'chatExport.save' : 'chatExport.share', {
                            format: format === 'html' ? 'HTML' : 'Markdown'
                          })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              {busy ? <ActivityIndicator accessibilityLabel={t('chatExport.preparing')} /> : null}
              {error ? <Text className="text-app-footnote text-app-danger">{error}</Text> : null}
              <Pressable
                accessibilityRole="button"
                onPress={close}
                className="min-h-[44px] items-center justify-center"
              >
                <Text className="text-app-body text-app-secondary">
                  {t(busy ? 'chatExport.cancel' : 'chatExport.close')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
});
