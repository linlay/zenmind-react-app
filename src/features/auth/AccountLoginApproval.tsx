import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { confirmAccountLoginChallenge } from '../../core/api/services/deviceLinkApi.ts';
import { useT } from '../../shared/i18n';
import { AccountChallengeScanner } from './AccountChallengeScanner';

export function AccountLoginApproval() {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [visible, setVisible] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!error || !visible) return;
    const timer = setTimeout(() => setError(''), 1800);
    return () => clearTimeout(timer);
  }, [error, visible]);
  function close() {
    request.current?.abort();
    request.current = null;
    setConnecting(false);
    setVisible(false);
    setError('');
  }
  async function open() {
    setError('');
    try {
      const next = permission?.granted ? permission : await requestPermission();
      if (!mounted.current) return;
      if (next.granted) setVisible(true);
      else setError(t('auth.error.cameraPermissionDenied'));
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : t('auth.challenge.failed'));
    }
  }
  async function confirm(raw: string) {
    if (request.current || error) return;
    const controller = new AbortController();
    request.current = controller;
    setConnecting(true);
    try {
      const parsed: unknown = JSON.parse(raw);
      const id = parsed && typeof parsed === 'object' && 'challengeId' in parsed ? parsed.challengeId : null;
      if (
        typeof id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
      )
        throw new Error(t('auth.challenge.failed'));
      await confirmAccountLoginChallenge(id, controller.signal);
      if (!controller.signal.aborted) close();
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t('auth.challenge.failed'));
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setConnecting(false);
    }
  }
  return (
    <View>
      <Pressable onPress={() => void open()} className="min-h-11 justify-center px-app-lg py-app-md">
        <Text className="text-app-body-sm font-bold text-app-action">{t('account.confirmLogin')}</Text>
      </Pressable>
      {!visible && error ? <Text className="px-app-lg pb-app-md text-app-body-sm text-app-danger">{error}</Text> : null}
      {visible ? (
        <AccountChallengeScanner
          errorMessage={error}
          isConnecting={connecting}
          isPaused={connecting || Boolean(error)}
          onBarcodeScanned={({ data }) => void confirm(data)}
          onRequestClose={close}
          onMountError={(message) => {
            close();
            setError(message);
          }}
        />
      ) : null}
    </View>
  );
}
