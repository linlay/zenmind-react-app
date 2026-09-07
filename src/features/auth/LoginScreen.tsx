import { useEffect, useRef, useState } from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type ViewStyle
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../app/navigation/types';
import { completeAccessOnboarding, continueWithoutPairing } from '../../core/auth/appAccess';
import { activateProfile, bootstrapAuth, loginWithPairingPayload } from '../../core/auth/appAuth';
import { getDesktopWsAuthErrorCode, isAbortError } from '../../core/auth/desktopWsAuthClient';
import { listDeviceProfiles, type DeviceProfile } from '../../core/auth/deviceProfiles';
import { AppKeyboardAwareScrollView } from '../../shared/components/AppKeyboardAwareScrollView';
import { brandAssets } from '../../shared/icons/brandAssets';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';
import { FullScreenPairingScanner } from './FullScreenPairingScanner';

type PairingMode = 'code' | 'scan';
type PairingSubmitSource = 'code' | 'scan';
type SubmissionKind = PairingSubmitSource | 'profile' | null;

const SCANNER_RETRY_DELAY_MS = 1_800;

const SAFE_AREA_CLASS = 'flex-1 bg-app-background';
const BOOTSTRAP_SHELL_CLASS = 'flex-1 items-center justify-center gap-app-md px-app-xl';
const BOOTSTRAP_TEXT_CLASS = 'text-app-body-sm text-app-secondary';
const KEYBOARD_SHELL_CLASS = 'flex-1';
const CONTENT_SHELL_CLASS = 'mx-auto w-full max-w-[440px] flex-1';
const SCROLL_VIEW_CLASS = 'flex-1';
const SCROLL_CONTENT_STYLE = {
  flexGrow: 1,
  paddingHorizontal: 24,
  paddingTop: 12,
  paddingBottom: 24
} satisfies ViewStyle;
const TOP_ACTIONS_CLASS = 'min-h-10 flex-row items-center justify-end';
const CLOSE_BUTTON_CLASS = 'rounded-app-sm px-app-sm py-app-sm active:bg-app-surface-muted';
const CLOSE_BUTTON_TEXT_CLASS = 'text-app-body-sm font-bold text-app-action';
const LOGO_WRAP_CLASS = 'items-center justify-center gap-app-sm pb-app-xl pt-app-lg';
const LOGO_CLASS = 'h-16 w-16';
const TITLE_CLASS = 'text-center text-app-title font-extrabold text-app-primary';
const SUBTITLE_CLASS = 'max-w-[340px] text-center text-app-body-sm leading-6 text-app-secondary';
const FORM_CLASS = 'gap-app-lg';
const SEGMENTED_CONTROL_CLASS = 'min-h-[44px] flex-row rounded-app-md bg-app-surface-muted p-1';
const SEGMENT_CLASS = 'flex-1 items-center justify-center rounded-app-sm px-app-md';
const SEGMENT_ACTIVE_CLASS = 'bg-app-surface';
const SEGMENT_TEXT_CLASS = 'text-app-body-sm font-bold text-app-tertiary';
const SEGMENT_ACTIVE_TEXT_CLASS = 'text-app-primary';
const INPUT_GROUP_CLASS = 'gap-app-sm';
const INPUT_LABEL_ROW_CLASS = 'flex-row items-center justify-between gap-app-md';
const INPUT_LABEL_CLASS = 'text-app-footnote font-bold text-app-secondary';
const PASTE_BUTTON_CLASS = 'rounded-app-sm px-app-sm py-app-xs active:bg-app-surface-muted';
const PASTE_BUTTON_TEXT_CLASS = 'text-app-footnote font-bold text-app-action';
const PAIRING_INPUT_CLASS =
  'min-h-[128px] rounded-app-md bg-app-surface-muted px-app-lg py-app-md text-[15px] leading-6 text-app-primary';
const ERROR_TEXT_CLASS = 'text-app-body-sm leading-5 text-app-danger';
const PRIMARY_BUTTON_CLASS =
  'min-h-[52px] items-center justify-center rounded-app-md bg-app-action active:opacity-[0.86]';
const PRIMARY_BUTTON_DISABLED_CLASS = 'opacity-[0.42]';
const PRIMARY_BUTTON_TEXT_CLASS = 'text-[16px] font-extrabold text-app-on-action';
const RECENT_SECTION_CLASS = 'gap-app-sm pt-app-sm';
const RECENT_LABEL_CLASS = 'text-app-caption font-bold uppercase tracking-wide text-app-tertiary';
const RECENT_LIST_CLASS = 'border-y border-app-line';
const RECENT_PROFILE_ROW_CLASS = 'min-h-[54px] justify-center py-[10px] active:bg-app-surface-muted';
const RECENT_PROFILE_DIVIDER_CLASS = 'border-t border-app-line';
const RECENT_PROFILE_NAME_CLASS = 'text-app-body-sm font-bold text-app-primary';
const RECENT_PROFILE_META_CLASS = 'mt-0.5 text-app-caption text-app-tertiary';
const FOOTER_CLASS = 'gap-app-xs border-t border-app-line px-app-xl pb-app-md pt-app-md';
const SKIP_BUTTON_CLASS = 'min-h-[42px] items-center justify-center rounded-app-sm active:bg-app-surface-muted';
const SKIP_BUTTON_TEXT_CLASS = 'text-app-body-sm font-bold text-app-secondary';
const SKIP_HINT_CLASS = 'text-center text-app-caption leading-5 text-app-tertiary';

function getProfileEndpoint(profile: DeviceProfile): string {
  return profile.desktopWs?.wsUrl || 'Desktop WS';
}

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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [pairingMode, setPairingMode] = useState<PairingMode>('code');
  const [pairingPayload, setPairingPayload] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [scannerErrorMessage, setScannerErrorMessage] = useState('');
  const [isScannerUnavailable, setIsScannerUnavailable] = useState(false);
  const [submissionKind, setSubmissionKind] = useState<SubmissionKind>(null);
  const [recentProfiles] = useState(() =>
    listDeviceProfiles()
      .filter((profile) => profile.transportKind === 'desktop-ws' && !profile.needsRelink && Boolean(profile.desktopWs))
      .slice(0, 3)
  );
  const pairingSubmitLockedRef = useRef(false);
  const pairingAbortControllerRef = useRef<AbortController | null>(null);
  const pairingAttemptIdRef = useRef(0);
  const scannerRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizedPairingPayload = pairingPayload.trim();
  const isSubmitting = submissionKind !== null;
  const isScannerConnecting = submissionKind === 'scan';
  const isScannerPaused = isScannerConnecting || Boolean(scannerErrorMessage) || isScannerUnavailable;
  const canSubmitPairingCode = Boolean(normalizedPairingPayload && !isSubmitting);
  const canClose = navigation.canGoBack();

  useEffect(
    () => () => {
      pairingAttemptIdRef.current += 1;
      pairingAbortControllerRef.current?.abort();
      if (scannerRetryTimerRef.current) {
        clearTimeout(scannerRetryTimerRef.current);
      }
    },
    []
  );

  function completeSuccessfulPairing() {
    completeAccessOnboarding();
  }

  function clearScannerRetryTimer() {
    if (!scannerRetryTimerRef.current) {
      return;
    }
    clearTimeout(scannerRetryTimerRef.current);
    scannerRetryTimerRef.current = null;
  }

  function cancelPairingAttempt() {
    pairingAttemptIdRef.current += 1;
    pairingAbortControllerRef.current?.abort();
    pairingAbortControllerRef.current = null;
    pairingSubmitLockedRef.current = false;
    if (submissionKind === 'code' || submissionKind === 'scan') {
      setSubmissionKind(null);
    }
  }

  function getPairingErrorMessage(error: unknown) {
    switch (getDesktopWsAuthErrorCode(error)) {
      case 'connect_timeout':
        return t('auth.error.desktopConnectTimeout');
      case 'request_timeout':
        return t('auth.error.desktopRequestTimeout');
      case 'connection_failed':
        return t('auth.error.desktopConnectionFailed');
      default:
        return String((error as Error)?.message || t('auth.error.loginFailed'));
    }
  }

  function showRetryableScannerError(message: string) {
    clearScannerRetryTimer();
    setScannerErrorMessage(message);
    scannerRetryTimerRef.current = setTimeout(() => {
      scannerRetryTimerRef.current = null;
      setScannerErrorMessage('');
      pairingSubmitLockedRef.current = false;
    }, SCANNER_RETRY_DELAY_MS);
  }

  async function submitPairingPayload(payloadText: string, source: PairingSubmitSource) {
    if (pairingSubmitLockedRef.current) {
      return;
    }
    const normalizedPayload = String(payloadText || '').trim();
    if (!normalizedPayload) {
      setErrorMessage(t('auth.error.pairingPayloadRequired'));
      return;
    }

    pairingSubmitLockedRef.current = true;
    const attemptId = pairingAttemptIdRef.current + 1;
    pairingAttemptIdRef.current = attemptId;
    const controller = new AbortController();
    pairingAbortControllerRef.current = controller;
    setSubmissionKind(source);
    if (source === 'scan') {
      clearScannerRetryTimer();
      setScannerErrorMessage('');
    } else {
      setErrorMessage('');
    }
    let keepScannerLocked = false;
    try {
      await loginWithPairingPayload(normalizedPayload, { signal: controller.signal });
      if (pairingAttemptIdRef.current !== attemptId) {
        return;
      }
      completeSuccessfulPairing();
    } catch (error) {
      if (pairingAttemptIdRef.current !== attemptId || isAbortError(error)) {
        return;
      }
      const message = getPairingErrorMessage(error);
      if (source === 'scan') {
        keepScannerLocked = true;
        showRetryableScannerError(message);
      } else {
        setErrorMessage(message);
      }
    } finally {
      if (pairingAttemptIdRef.current === attemptId) {
        pairingAbortControllerRef.current = null;
        setSubmissionKind(null);
        if (!keepScannerLocked) {
          pairingSubmitLockedRef.current = false;
        }
      }
    }
  }

  async function handleSelectScanner() {
    if (isSubmitting) {
      return;
    }
    if (!cameraPermission?.granted) {
      const nextPermission = await requestCameraPermission();
      if (!nextPermission.granted) {
        setPairingMode('code');
        setErrorMessage(t('auth.error.cameraPermissionDenied'));
        return;
      }
    }
    setErrorMessage('');
    clearScannerRetryTimer();
    setScannerErrorMessage('');
    setIsScannerUnavailable(false);
    setPairingMode('scan');
  }

  function handleCloseScanner() {
    cancelPairingAttempt();
    clearScannerRetryTimer();
    setScannerErrorMessage('');
    setIsScannerUnavailable(false);
    setPairingMode('code');
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    const data = String(result.data || '').trim();
    if (data) {
      submitPairingPayload(data, 'scan').catch(() => {});
    }
  }

  function handleScannerMountError(message: string) {
    clearScannerRetryTimer();
    pairingSubmitLockedRef.current = true;
    setIsScannerUnavailable(true);
    setScannerErrorMessage(message || t('auth.scan.mountFailed'));
  }

  async function handleQuickProfile(profile: DeviceProfile) {
    if (isSubmitting) {
      return;
    }
    setSubmissionKind('profile');
    setErrorMessage('');
    try {
      activateProfile(profile.desktopDeviceId);
      const restored = await bootstrapAuth('');
      if (!restored) {
        throw new Error(t('auth.error.loginFailed'));
      }
      completeSuccessfulPairing();
    } catch (error) {
      setErrorMessage(String((error as Error)?.message || t('auth.error.loginFailed')));
    } finally {
      setSubmissionKind(null);
    }
  }

  async function handlePastePairingPayload() {
    const text = String(await Clipboard.getStringAsync()).trim();
    if (!text) {
      setErrorMessage(t('auth.error.pairingClipboardEmpty'));
      return;
    }
    setPairingPayload(text);
    setErrorMessage('');
  }

  function handleSkip() {
    continueWithoutPairing();
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  function handleCloseLogin() {
    cancelPairingAttempt();
    navigation.goBack();
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className={SAFE_AREA_CLASS}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className={KEYBOARD_SHELL_CLASS}>
        <View className={CONTENT_SHELL_CLASS}>
          <AppKeyboardAwareScrollView
            bounces={false}
            className={SCROLL_VIEW_CLASS}
            contentContainerStyle={SCROLL_CONTENT_STYLE}
            showsVerticalScrollIndicator={false}
          >
            <View className={TOP_ACTIONS_CLASS}>
              {canClose ? (
                <Pressable onPress={handleCloseLogin} className={CLOSE_BUTTON_CLASS}>
                  <Text className={CLOSE_BUTTON_TEXT_CLASS}>{t('auth.close')}</Text>
                </Pressable>
              ) : null}
            </View>

            <View className={LOGO_WRAP_CLASS}>
              <Image source={brandAssets.logo} className={LOGO_CLASS} resizeMode="contain" />
              <Text className={TITLE_CLASS}>{t('auth.welcome.title')}</Text>
              <Text className={SUBTITLE_CLASS}>{t('auth.welcome.subtitle')}</Text>
            </View>

            <View className={FORM_CLASS}>
              <View accessibilityRole="tablist" className={SEGMENTED_CONTROL_CLASS}>
                <View
                  accessibilityRole="tab"
                  accessibilityState={{ selected: true }}
                  className={cn(SEGMENT_CLASS, SEGMENT_ACTIVE_CLASS)}
                >
                  <Text className={cn(SEGMENT_TEXT_CLASS, SEGMENT_ACTIVE_TEXT_CLASS)}>{t('auth.mode.code')}</Text>
                </View>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: false }}
                  disabled={isSubmitting}
                  onPress={() => {
                    handleSelectScanner().catch((error) => {
                      setErrorMessage(String((error as Error)?.message || t('auth.error.loginFailed')));
                    });
                  }}
                  className={SEGMENT_CLASS}
                >
                  <Text className={SEGMENT_TEXT_CLASS}>{t('auth.mode.scan')}</Text>
                </Pressable>
              </View>

              <View className={INPUT_GROUP_CLASS}>
                <View className={INPUT_LABEL_ROW_CLASS}>
                  <Text className={INPUT_LABEL_CLASS}>{t('auth.pairingPayload.label')}</Text>
                  <Pressable
                    disabled={isSubmitting}
                    hitSlop={8}
                    onPress={() => {
                      handlePastePairingPayload().catch((error) => {
                        setErrorMessage(String((error as Error)?.message || t('auth.error.loginFailed')));
                      });
                    }}
                    className={PASTE_BUTTON_CLASS}
                  >
                    <Text className={PASTE_BUTTON_TEXT_CLASS}>{t('auth.pairingPayload.paste')}</Text>
                  </Pressable>
                </View>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  maxLength={4096}
                  multiline
                  onChangeText={(value) => {
                    setPairingPayload(value);
                    if (errorMessage) {
                      setErrorMessage('');
                    }
                  }}
                  placeholder={t('auth.pairingPayload.placeholder')}
                  placeholderTextColor={theme.colors.textTertiary}
                  className={PAIRING_INPUT_CLASS}
                  value={pairingPayload}
                />
              </View>

              {errorMessage ? <Text className={ERROR_TEXT_CLASS}>{errorMessage}</Text> : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmitPairingCode}
                onPress={() => {
                  submitPairingPayload(normalizedPairingPayload, 'code').catch(() => {});
                }}
                className={cn(PRIMARY_BUTTON_CLASS, !canSubmitPairingCode && PRIMARY_BUTTON_DISABLED_CLASS)}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={theme.colors.onBrandBlueAction} />
                ) : (
                  <Text className={PRIMARY_BUTTON_TEXT_CLASS}>{t('auth.submitPairing')}</Text>
                )}
              </Pressable>

              {recentProfiles.length > 0 ? (
                <View className={RECENT_SECTION_CLASS}>
                  <Text className={RECENT_LABEL_CLASS}>{t('auth.recent')}</Text>
                  <View className={RECENT_LIST_CLASS}>
                    {recentProfiles.map((profile, index) => (
                      <Pressable
                        key={profile.desktopDeviceId}
                        disabled={isSubmitting}
                        onPress={() => {
                          handleQuickProfile(profile).catch(() => {});
                        }}
                        className={cn(RECENT_PROFILE_ROW_CLASS, index > 0 && RECENT_PROFILE_DIVIDER_CLASS)}
                      >
                        <Text className={RECENT_PROFILE_NAME_CLASS} numberOfLines={1}>
                          {profile.displayName}
                        </Text>
                        <Text className={RECENT_PROFILE_META_CLASS} numberOfLines={1}>
                          {getProfileEndpoint(profile)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </AppKeyboardAwareScrollView>

          <View className={FOOTER_CLASS}>
            <Pressable disabled={isSubmitting} onPress={handleSkip} className={SKIP_BUTTON_CLASS}>
              <Text className={SKIP_BUTTON_TEXT_CLASS}>{t('auth.skip')}</Text>
            </Pressable>
            <Text className={SKIP_HINT_CLASS}>{t('auth.skip.hint')}</Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      {pairingMode === 'scan' ? (
        <FullScreenPairingScanner
          errorMessage={scannerErrorMessage}
          isConnecting={isScannerConnecting}
          isPaused={isScannerPaused}
          onBarcodeScanned={handleBarcodeScanned}
          onMountError={handleScannerMountError}
          onRequestClose={handleCloseScanner}
        />
      ) : null}
    </SafeAreaView>
  );
}
