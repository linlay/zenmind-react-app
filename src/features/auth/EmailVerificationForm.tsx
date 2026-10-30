import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, AppState, Pressable, Text, TextInput, View } from 'react-native';
import { normalizeAccountEmail, type AccountEmailReceipt } from '../../core/api/contracts/accountEmail.ts';
import { accountEmailErrorKey, requestEmailLoginCode } from '../../core/api/services/accountEmailApi.ts';
import { getAccountAuthGeneration, loginWithAccountEmail } from '../../core/auth/accountAuth.ts';
import { useAccountAuth } from '../../core/auth/useAccountAuth';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';

const INPUT_CLASS = 'min-h-[52px] rounded-app-md bg-app-surface-muted px-app-lg text-app-body text-app-primary';
const BUTTON_CLASS = 'min-h-[52px] items-center justify-center rounded-app-md bg-app-action active:opacity-[0.86]';

const RESEND_COOLDOWN_MS = 60_000;
export function EmailVerificationForm({ onSuccess }: { onSuccess: () => void }) {
  const account = useAccountAuth();
  const t = useT();
  const { theme } = useAppTheme();
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [receipt, setReceipt] = useState<AccountEmailReceipt | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<'send' | 'submit' | null>(null);
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const ownLoginGenerationRef = useRef<number | null>(null);
  const observedGenerationRef = useRef(getAccountAuthGeneration());
  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    ownLoginGenerationRef.current = null;
    setBusy(null);
    setSecret('');
    setReceipt(null);
  }, []);
  useFocusEffect(useCallback(() => () => cancel(), [cancel]));
  useEffect(() => {
    const generation = getAccountAuthGeneration();
    if (observedGenerationRef.current === generation) return;
    observedGenerationRef.current = generation;
    if (ownLoginGenerationRef.current === generation) return;
    cancel();
    setEmail('');
    setError('');
  }, [account, cancel]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stopAt = Math.max(resendAt, receipt ? Date.parse(receipt.expiresAt) : 0);
    const sync = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      setNow(Date.now());
      if (AppState.currentState === 'active' && stopAt > Date.now())
        timer = setInterval(() => {
          setNow(Date.now());
          if (Date.now() >= stopAt && timer) {
            clearInterval(timer);
            timer = undefined;
          }
        }, 1000);
    };
    sync();
    const listener = AppState.addEventListener('change', sync);
    return () => {
      if (timer) clearInterval(timer);
      listener.remove();
    };
  }, [resendAt, receipt]);
  const normalized = normalizeAccountEmail(email);
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expired = Boolean(receipt && Date.parse(receipt.expiresAt) <= now);
  const canSubmit = Boolean(normalized && !busy && receipt && !expired && /^\d{6}$/u.test(secret));
  const accountLabel = t('accountEmail.email');
  const secretLabel = t('accountEmail.code');
  async function handleRequest(action: 'send' | 'submit') {
    if (controllerRef.current || !normalized || (action === 'send' ? seconds : !canSubmit)) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    let generation = getAccountAuthGeneration();
    setBusy(action);
    setError('');
    try {
      if (action === 'send') {
        const value = await requestEmailLoginCode(normalized.email, controller.signal);
        if (controller.signal.aborted || generation !== getAccountAuthGeneration()) return;
        setReceipt(value);
        setSecret('');
        setResendAt(Date.now() + RESEND_COOLDOWN_MS);
        setNow(Date.now());
      } else {
        ownLoginGenerationRef.current = generation + 1;
        const request = loginWithAccountEmail({
          email: normalized.email,
          code: secret,
          signal: controller.signal
        });
        ownLoginGenerationRef.current = generation = getAccountAuthGeneration();
        await request;
        if (controller.signal.aborted || generation !== getAccountAuthGeneration()) return;
        cancel();
        onSuccess();
      }
    } catch (e) {
      if (!controller.signal.aborted && generation === getAccountAuthGeneration()) setError(t(accountEmailErrorKey(e)));
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(null);
      }
    }
  }
  return (
    <View className="gap-app-md">
      <Text className="text-app-footnote font-bold text-app-secondary">{accountLabel}</Text>
      <TextInput
        value={email}
        onChangeText={(value) => {
          cancel();
          setEmail(value);
          setError('');
        }}
        accessibilityLabel={accountLabel}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={254}
        editable={busy !== 'submit'}
        className={INPUT_CLASS}
        placeholder={accountLabel}
        placeholderTextColor={theme.colors.textTertiary}
      />
      <Text className="text-app-footnote font-bold text-app-secondary">{secretLabel}</Text>
      <TextInput
        value={secret}
        onChangeText={(value) => setSecret(value.replace(/\D/gu, '').slice(0, 6))}
        accessibilityLabel={secretLabel}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={6}
        editable={!busy}
        className={INPUT_CLASS}
        placeholder="000000"
        placeholderTextColor={theme.colors.textTertiary}
      />
      <Pressable
        accessibilityRole="button"
        disabled={Boolean(busy || seconds || !normalized)}
        onPress={() => void handleRequest('send')}
        className={cn(
          'min-h-11 items-center justify-center rounded-app-sm border border-app-line',
          Boolean(busy || seconds || !normalized) && 'opacity-40'
        )}
      >
        {busy === 'send' ? (
          <ActivityIndicator color={theme.colors.brandBlueAction} />
        ) : (
          <Text className="font-semibold text-app-action">
            {seconds ? t('accountEmail.resend', { seconds }) : t('accountEmail.getCode')}
          </Text>
        )}
      </Pressable>
      <Text className="text-app-footnote leading-5 text-app-secondary">{t('accountEmail.deliveryHint')}</Text>
      <Text className="text-app-footnote leading-5 text-app-secondary">{t('accountEmail.loginHint')}</Text>
      {error || expired ? (
        <Text accessibilityRole="alert" className="text-app-body-sm text-app-danger">
          {error || t('accountEmail.error.expired')}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => void handleRequest('submit')}
        disabled={!canSubmit}
        className={cn(BUTTON_CLASS, !canSubmit && 'opacity-40')}
      >
        {busy === 'submit' ? (
          <ActivityIndicator color={theme.colors.onBrandBlueAction} />
        ) : (
          <Text className="text-app-body font-bold text-app-on-action">{t('auth.submitAccount')}</Text>
        )}
      </Pressable>
    </View>
  );
}
