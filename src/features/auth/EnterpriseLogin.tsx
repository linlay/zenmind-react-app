import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  beginEnterpriseAccountLogin,
  cancelEnterpriseAccountLogin,
  completeEnterpriseAccountLogin,
  getAccountAuthGeneration
} from '../../core/auth/accountAuth';
import { readEnterpriseApiBaseUrl } from '../../core/auth/authConfig';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';

export function EnterpriseLogin({ onSuccess }: { onSuccess: () => void }) {
  const t = useT();
  const { theme } = useAppTheme();
  const [attempt, setAttempt] = useState(0);
  const [readyAttempt, setReadyAttempt] = useState(-1);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const pendingRef = useRef(false);
  const committedRef = useRef(false);
  const generationRef = useRef(-1);
  const controllerRef = useRef<AbortController | null>(null);
  const base = readEnterpriseApiBaseUrl();
  const origin = base ? new URL(base).origin : '';
  const native = Platform.OS === 'ios' || Platform.OS === 'android';
  useFocusEffect(
    useCallback(() => {
      if (!native || !base) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      committedRef.current = false;
      pendingRef.current = false;
      setReadyAttempt(-1);
      setVerifying(false);
      setError('');
      const preparation = beginEnterpriseAccountLogin(controller.signal);
      generationRef.current = getAccountAuthGeneration();
      const generation = generationRef.current;
      void preparation
        .then(() => {
          if (!controller.signal.aborted && generation === getAccountAuthGeneration()) setReadyAttempt(attempt);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(t('auth.error.loginFailed'));
        });
      return () => {
        controller.abort();
        if (!committedRef.current) void cancelEnterpriseAccountLogin(generation).catch(() => {});
      };
    }, [attempt, base, native, t])
  );

  async function verifyCompletion(url: string) {
    const controller = controllerRef.current;
    if (!controller || controller.signal.aborted || pendingRef.current || committedRef.current) return;
    let completed: URL;
    try {
      completed = new URL(url);
    } catch {
      return;
    }
    if (completed.origin !== origin || completed.pathname !== '/') return;
    pendingRef.current = true;
    setVerifying(true);
    try {
      await completeEnterpriseAccountLogin(generationRef.current, controller.signal);
      if (controller.signal.aborted || generationRef.current !== getAccountAuthGeneration()) return;
      committedRef.current = true;
      onSuccess();
    } catch {
      if (!controller.signal.aborted) setError(t('auth.error.loginFailed'));
    } finally {
      pendingRef.current = false;
      if (!controller.signal.aborted) setVerifying(false);
    }
  }
  if (!native) return <Text className="px-app-xl py-app-lg text-app-secondary">{t('auth.sso.nativeOnly')}</Text>;
  return (
    <View className="flex-1">
      {error ? (
        <View className="gap-app-md px-app-xl py-app-lg">
          <Text accessibilityRole="alert" className="text-app-danger">
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAttempt((value) => value + 1)}
            className="min-h-11 items-center justify-center rounded-app-sm bg-app-action"
          >
            <Text className="font-bold text-app-on-action">{t('auth.sso.retry')}</Text>
          </Pressable>
        </View>
      ) : readyAttempt === attempt ? (
        <WebView
          key={attempt}
          source={{ uri: new URL('/api/login/oidc/start', base).toString() }}
          originWhitelist={['https://*', origin]}
          onShouldStartLoadWithRequest={({ url }) => {
            try {
              const target = new URL(url);
              return target.protocol === 'https:' || target.origin === origin;
            } catch {
              return false;
            }
          }}
          onNavigationStateChange={({ url, loading }) => {
            if (!loading) void verifyCompletion(url);
          }}
          onError={() => setError(t('auth.error.loginFailed'))}
          onHttpError={() => setError(t('auth.error.loginFailed'))}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          startInLoadingState
          renderLoading={() => <ActivityIndicator color={theme.colors.brandBlueAction} />}
          style={{ flex: 1, backgroundColor: theme.colors.background }}
        />
      ) : (
        <ActivityIndicator color={theme.colors.brandBlueAction} />
      )}
      {verifying && <ActivityIndicator color={theme.colors.brandBlueAction} />}
    </View>
  );
}
