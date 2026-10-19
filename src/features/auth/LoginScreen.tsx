import { useEffect, useRef, useState } from 'react';
import { useNavigation, useRoute, type RouteProp, type NavigationProp } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../app/navigation/types';
import { verifyDefaultCloud } from '../chatPersistence/cloudAccess';
import { activateAccountDesktopSource } from '../chatPersistence/accountDesktopSource';
import { AppKeyboardAwareScrollView } from '../../shared/components/AppKeyboardAwareScrollView';
import { brandAssets } from '../../shared/icons/brandAssets';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';
import { EmailVerificationForm } from './EmailVerificationForm';

const SAFE_AREA_CLASS = 'flex-1 bg-app-background';
const BOOTSTRAP_SHELL_CLASS = 'flex-1 items-center justify-center gap-app-md px-app-xl';
const BOOTSTRAP_TEXT_CLASS = 'text-app-body-sm text-app-secondary';
const KEYBOARD_SHELL_CLASS = 'flex-1';
const CONTENT_SHELL_CLASS = 'mx-auto w-full max-w-[440px] flex-1';
const SCROLL_VIEW_CLASS = 'flex-1';
const TOP_ACTIONS_CLASS = 'min-h-10 flex-row items-center justify-end';
const CLOSE_BUTTON_CLASS = 'rounded-app-sm px-app-sm py-app-sm active:bg-app-surface-muted';
const CLOSE_BUTTON_TEXT_CLASS = 'text-app-body-sm font-bold text-app-action';
const LOGO_WRAP_CLASS = 'items-center justify-center gap-app-sm pb-app-xl pt-app-lg';
const LOGO_CLASS = 'h-16 w-16';
const TITLE_CLASS = 'text-center text-app-title font-extrabold text-app-primary';
const SUBTITLE_CLASS = 'max-w-[340px] text-center text-app-body-sm leading-6 text-app-secondary';
const FORM_CLASS = 'gap-app-lg';
const INPUT_LABEL_CLASS = 'text-app-footnote font-bold text-app-secondary';
const TEXT_INPUT_CLASS = 'min-h-[52px] rounded-app-md bg-app-surface-muted px-app-lg text-[15px] text-app-primary';
const ERROR_TEXT_CLASS = 'text-app-body-sm leading-5 text-app-danger';
const PRIMARY_BUTTON_CLASS =
  'min-h-[52px] items-center justify-center rounded-app-md bg-app-action active:opacity-[0.86]';
const PRIMARY_BUTTON_DISABLED_CLASS = 'opacity-[0.42]';
const PRIMARY_BUTTON_TEXT_CLASS = 'text-[16px] font-extrabold text-app-on-action';

export function AuthBootstrapScreen() {
  const t = useT();
  const { theme } = useAppTheme();

  return (
    <SafeAreaView edges={['top', 'bottom']} className={SAFE_AREA_CLASS}>
      <View className={BOOTSTRAP_SHELL_CLASS}>
        <ActivityIndicator size="small" color={theme.colors.brandBlueAction} />
        <Text className={BOOTSTRAP_TEXT_CLASS}>{t('auth.bootstrap.restoring')}</Text>
      </View>
    </SafeAreaView>
  );
}

export function LoginScreen() {
  const t = useT();
  const { theme } = useAppTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Login'>>();
  const [mode, setMode] = useState<'account' | 'cloud'>(route.params?.mode || 'account');
  const [token, setToken] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  function closeLogin() {
    controllerRef.current?.abort();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }
  async function handleCloudLogin() {
    if (!token.trim() || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setSubmitting(true);
    setErrorMessage('');
    try {
      const status = await verifyDefaultCloud(token, controller.signal);
      if (controller.signal.aborted) return;
      if (status !== 'available') {
        setErrorMessage(t(`cloud.status.${status}`));
        return;
      }
      await activateAccountDesktopSource('', null);
      if (!controller.signal.aborted) {
        setToken('');
        closeLogin();
      }
    } catch {
      if (!controller.signal.aborted) setErrorMessage(t('auth.error.loginFailed'));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }
  return (
    <SafeAreaView edges={['top', 'bottom']} className={SAFE_AREA_CLASS}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className={KEYBOARD_SHELL_CLASS}>
        <View className={CONTENT_SHELL_CLASS}>
          <AppKeyboardAwareScrollView
            className={SCROLL_VIEW_CLASS}
            showsVerticalScrollIndicator={false}
            contentContainerClassName="grow px-app-xl pt-app-md pb-app-xl"
          >
            <View className={TOP_ACTIONS_CLASS}>
              <Pressable accessibilityRole="button" onPress={closeLogin} className={CLOSE_BUTTON_CLASS}>
                <Text className={CLOSE_BUTTON_TEXT_CLASS}>{t('auth.close')}</Text>
              </Pressable>
            </View>
            <View className={LOGO_WRAP_CLASS}>
              <Image source={brandAssets.logo} className={LOGO_CLASS} resizeMode="contain" />
              <Text className={TITLE_CLASS}>{t('auth.welcome.title')}</Text>
              <Text className={SUBTITLE_CLASS}>
                {t(mode === 'cloud' ? 'cloud.loginHint' : 'auth.welcome.subtitle')}
              </Text>
            </View>
            <View className="mb-app-lg flex-row gap-app-sm">
              {(['account', 'cloud'] as const).map((option) => (
                <Pressable
                  key={option}
                  disabled={isSubmitting}
                  onPress={() => {
                    controllerRef.current?.abort();
                    controllerRef.current = null;
                    setSubmitting(false);
                    setMode(option);
                    setErrorMessage('');
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: mode === option }}
                  className={cn(
                    'min-h-11 flex-1 items-center justify-center rounded-app-sm',
                    mode === option ? 'bg-app-action' : 'bg-app-surface-muted'
                  )}
                >
                  <Text className={mode === option ? 'font-bold text-app-on-action' : 'text-app-secondary'}>
                    {t(option === 'cloud' ? 'cloud.login' : 'auth.mode.account')}
                  </Text>
                </Pressable>
              ))}
            </View>
            {mode === 'cloud' ? (
              <View className={FORM_CLASS}>
                <Text className={INPUT_LABEL_CLASS}>{t('cloud.token')}</Text>
                <TextInput
                  value={token}
                  onChangeText={setToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  maxLength={8192}
                  editable={!isSubmitting}
                  className={TEXT_INPUT_CLASS}
                  placeholder={t('cloud.tokenPlaceholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                />
                {errorMessage ? <Text className={ERROR_TEXT_CLASS}>{errorMessage}</Text> : null}
                <Pressable
                  disabled={!token.trim() || isSubmitting}
                  onPress={() => void handleCloudLogin()}
                  accessibilityRole="button"
                  className={cn(PRIMARY_BUTTON_CLASS, (!token.trim() || isSubmitting) && PRIMARY_BUTTON_DISABLED_CLASS)}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={theme.colors.onBrandBlueAction} />
                  ) : (
                    <Text className={PRIMARY_BUTTON_TEXT_CLASS}>{t('cloud.login')}</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <View className={FORM_CLASS}>
                <EmailVerificationForm onSuccess={closeLogin} />
              </View>
            )}
          </AppKeyboardAwareScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
