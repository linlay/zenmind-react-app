import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { getCloudAuthSnapshot, subscribeCloudAuth } from '../../../../core/auth/cloudAuth.ts';
import { prepareAuthenticatedDocumentPreview } from '../../../../core/api/services/documentPreview.ts';
import { DocumentPreviewError } from '../../../../core/api/services/documentPreviewProtocol.ts';
import { useT } from '../../../../shared/i18n/index.ts';
import { getChatSourceFromId } from '../../chatSource.ts';
import type { AuthenticatedResourcePreviewTarget } from '../../authenticatedResourcePreview.ts';

/** No automatic uploads or local Office parser: explicit server conversion then top-level system browser. */
export const AuthenticatedOfficePreview = memo(function AuthenticatedOfficePreview({
  target,
  conversationId
}: {
  target: AuthenticatedResourcePreviewTarget;
  conversationId: string;
}) {
  const t = useT();
  const cloud = useSyncExternalStore(subscribeCloudAuth, getCloudAuthSnapshot, getCloudAuthSnapshot);
  const key = JSON.stringify([
    cloud.scopeId,
    cloud.generation,
    conversationId,
    target.key,
    target.resourceUrl,
    target.name
  ]);
  const activeKey = useRef(key);
  activeKey.current = key;
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setBusy(false);
    setError('');
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [key]);
  const open = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const source = getChatSourceFromId(conversationId);
      const result = await prepareAuthenticatedDocumentPreview({
        sourceKind: source.kind,
        sourceId: source.sourceId,
        resourceUrl: target.resourceUrl,
        name: target.name,
        signal: controller.signal
      });
      if (controller.signal.aborted || activeKey.current !== key) return;
      await Linking.openURL(result.url);
    } catch (error) {
      if (!controller.signal.aborted && activeKey.current === key) {
        const code = error instanceof DocumentPreviewError ? error.code : 'failed';
        setError(
          t(
            code === 'disabled'
              ? 'officePreview.disabled'
              : code === 'unavailable'
                ? 'officePreview.unavailable'
                : code === 'too_large'
                  ? 'officePreview.tooLarge'
                  : 'officePreview.failed'
          )
        );
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted && activeKey.current === key) setBusy(false);
      }
    }
  }, [conversationId, key, t, target.name, target.resourceUrl]);
  return (
    <View className="flex-1 items-center justify-center gap-app-md px-app-lg">
      <Text className="text-center text-app-body text-app-secondary">{t('officePreview.scope')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('officePreview.open')}
        disabled={busy}
        onPress={open}
        className="min-h-[42px] items-center justify-center rounded-app-md bg-app-action px-app-lg"
      >
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Text className="text-app-body font-semibold text-app-on-action">{t('officePreview.open')}</Text>
        )}
      </Pressable>
      {busy ? <Text className="text-app-caption text-app-secondary">{t('officePreview.preparing')}</Text> : null}
      {error ? (
        <Text selectable className="text-center text-app-footnote text-app-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
});
