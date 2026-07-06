import { useEffect, useMemo, useRef, useState } from 'react';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ViewStyle
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  activateProfile,
  bootstrapAuth,
  loginWithMasterPassword,
  loginWithPairingPayload,
  readPreferredDeviceName
} from '../../core/auth/appAuth';
import { listDeviceProfiles, type DeviceProfile } from '../../core/auth/deviceProfiles';
import { readResolvedApiBaseUrl } from '../../core/auth/authConfig';
import { normalizeApiBaseUrl } from '../../core/config/endpoint';
import { brandAssets } from '../../shared/icons/brandAssets';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';

const SAFE_AREA_CLASS = 'flex-1 bg-app-background';
const BOOTSTRAP_SHELL_CLASS = 'flex-1 items-center justify-center px-app-xl';
const BOOTSTRAP_CARD_CLASS =
  'flex-row items-center gap-[10px] rounded-app-lg border border-app-line-strong bg-app-surface px-[18px] py-app-lg';
const BOOTSTRAP_TEXT_CLASS = 'text-app-body-sm text-app-secondary';
const KEYBOARD_SHELL_CLASS = 'flex-1';
const SCROLL_CONTENT_STYLE = {
  flexGrow: 1,
  paddingHorizontal: 20,
  gap: 18
} satisfies ViewStyle;
const LOGO_WRAP_CLASS = 'items-center justify-center pb-app-xs pt-[6px]';
const LOGO_CLASS = 'h-[88px] w-[88px]';
const FORM_CARD_CLASS =
  'gap-[14px] rounded-app-lg border border-app-line-strong bg-app-surface px-app-xl py-app-xl';
const MODE_TABS_CLASS =
  'h-11 flex-row gap-[3px] rounded-app-md border border-app-line-strong bg-app-surface-muted p-[3px]';
const MODE_TAB_CLASS = 'flex-1 items-center justify-center rounded-app-sm active:opacity-[0.82]';
const MODE_TAB_ACTIVE_CLASS = 'bg-app-surface';
const MODE_TAB_TEXT_CLASS = 'text-app-body-sm font-bold text-app-secondary';
const MODE_TAB_TEXT_ACTIVE_CLASS = 'text-app-primary';
const RECENT_PROFILES_CLASS = 'overflow-hidden rounded-app-md border border-app-line-strong';
const RECENT_PROFILE_ROW_CLASS =
  'min-h-[52px] justify-center border-b border-app-line px-[14px] py-[9px] active:bg-app-surface-muted';
const RECENT_PROFILE_NAME_CLASS = 'text-app-body-sm font-extrabold text-app-primary';
const RECENT_PROFILE_META_CLASS = 'mt-0.5 text-app-caption text-app-tertiary';
const INPUT_GROUP_CLASS = 'gap-app-sm';
const INPUT_LABEL_ROW_CLASS = 'min-h-7 flex-row flex-wrap items-center justify-between gap-app-md';
const INPUT_LABEL_CLASS = 'text-app-footnote font-bold text-app-primary';
const SCAN_ACTIONS_CLASS = 'flex-row items-center gap-app-sm';
const INLINE_ACTION_BUTTON_CLASS =
  'min-h-7 items-center justify-center rounded-app-sm bg-app-surface-muted px-[10px] active:opacity-[0.78]';
const INLINE_ACTION_BUTTON_TEXT_CLASS = 'text-app-caption font-extrabold text-app-action';
const INPUT_CLASS =
  'h-[52px] rounded-app-md border border-app-line-strong bg-app-surface-muted px-app-lg text-[16px] text-app-primary';
const SCAN_PLACEHOLDER_CLASS =
  'min-h-[188px] items-center justify-center gap-[14px] rounded-app-lg border border-dashed border-app-line-strong bg-app-surface-muted px-[18px] py-app-xl active:bg-app-surface-raised';
const SCAN_PLACEHOLDER_DISABLED_CLASS = 'opacity-[0.48]';
const SCAN_PLACEHOLDER_ICON_CLASS = 'relative h-[86px] w-[86px]';
const SCAN_CORNER_CLASS = 'absolute h-7 w-7 border-app-action';
const SCAN_CORNER_TOP_LEFT_CLASS = 'left-0 top-0 border-l-[3px] border-t-[3px]';
const SCAN_CORNER_TOP_RIGHT_CLASS = 'right-0 top-0 border-r-[3px] border-t-[3px]';
const SCAN_CORNER_BOTTOM_LEFT_CLASS = 'bottom-0 left-0 border-b-[3px] border-l-[3px]';
const SCAN_CORNER_BOTTOM_RIGHT_CLASS = 'bottom-0 right-0 border-b-[3px] border-r-[3px]';
const SCAN_PLACEHOLDER_TEXT_CLASS = 'max-w-[260px] text-center text-app-body-sm text-app-secondary';
const SCANNER_SHELL_CLASS = 'h-[262px] overflow-hidden rounded-app-lg border border-app-line-strong bg-gray-900';
const ABSOLUTE_FILL_STYLE = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
} satisfies ViewStyle;
const SCANNER_OVERLAY_CLASS = 'absolute inset-0 items-center justify-center bg-slate-900/15';
const SCANNER_FRAME_CLASS = 'h-[168px] w-[168px] rounded-app-md border-2 border-white/90 bg-white/[0.04]';
const SCANNER_BUSY_PILL_CLASS =
  'absolute bottom-app-lg min-h-[38px] flex-row items-center justify-center gap-app-sm rounded-app-pill bg-app-action px-[14px]';
const SCANNER_BUSY_TEXT_CLASS = 'text-app-footnote font-extrabold text-app-on-action';
const PASSWORD_INPUT_SHELL_CLASS =
  'h-[52px] flex-row items-center rounded-app-md border border-app-line-strong bg-app-surface-muted pl-app-lg pr-app-sm';
const PASSWORD_INPUT_CLASS = 'h-full flex-1 text-[16px] text-app-primary';
const EYE_BUTTON_CLASS = 'h-10 w-10 items-center justify-center rounded-app-md active:bg-app-surface-raised';
const EYE_ICON_CLASS = 'h-4 w-[22px] items-center justify-center';
const EYE_OUTLINE_CLASS = 'absolute h-3 w-5 rounded-[20px] border-[1.6px] border-app-tertiary';
const EYE_PUPIL_CLASS = 'h-[5px] w-[5px] rounded-app-pill bg-app-tertiary';
const EYE_SLASH_CLASS = 'absolute h-[1.8px] w-[22px] rotate-[-32deg] rounded-app-pill bg-app-tertiary';
const ERROR_TEXT_CLASS = 'text-app-body-sm text-app-danger';
const SUBMIT_BUTTON_CLASS =
  'mt-app-xs min-h-[54px] items-center justify-center rounded-app-lg bg-app-action active:opacity-[0.86]';
const SUBMIT_BUTTON_DISABLED_CLASS = 'opacity-[0.48]';
const SUBMIT_BUTTON_TEXT_CLASS = 'text-[16px] font-extrabold text-app-on-action';

function getDeviceProfileEndpoint(profile: DeviceProfile): string {
  return profile.transportKind === 'desktop-ws' ? profile.desktopWs?.wsUrl || 'Desktop WS' : profile.apiBaseUrl;
}

export function AuthBootstrapScreen() {
  const t = useT();
  const { theme } = useAppTheme();

  return (
    <SafeAreaView edges={['top', 'bottom']} className={SAFE_AREA_CLASS}>
      <View className={BOOTSTRAP_SHELL_CLASS}>
        <View className={BOOTSTRAP_CARD_CLASS}>
          <ActivityIndicator size="small" color={theme.colors.brandBlueAction} />
          <Text className={BOOTSTRAP_TEXT_CLASS}>{t('auth.bootstrap.restoring')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function LoginScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [endpointDraft, setEndpointDraft] = useState(() => readResolvedApiBaseUrl());
  const [deviceName, setDeviceName] = useState(() => readPreferredDeviceName());
  const [masterPassword, setMasterPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loginMode, setLoginMode] = useState<'pairing' | 'manual'>('pairing');
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const pairingSubmitLockedRef = useRef(false);

  const normalizedEndpoint = useMemo(() => normalizeApiBaseUrl(endpointDraft), [endpointDraft]);
  const normalizedDeviceName = useMemo(() => String(deviceName || '').trim(), [deviceName]);
  const normalizedPassword = useMemo(() => String(masterPassword || '').trim(), [masterPassword]);
  const recentProfiles = listDeviceProfiles()
    .filter((profile) => !profile.needsRelink)
    .slice(0, 3);
  const canSubmit =
    loginMode === 'pairing'
      ? Boolean(normalizedDeviceName && !isSubmitting)
      : Boolean(normalizedEndpoint && normalizedDeviceName && normalizedPassword && !isSubmitting);

  useEffect(() => {
    if (loginMode === 'pairing') {
      setErrorMessage('');
      return;
    }

    if (!normalizedEndpoint) {
      setErrorMessage(t('auth.error.endpointRequired'));
      return;
    }

    setErrorMessage('');
  }, [loginMode, normalizedEndpoint, t]);

  useEffect(() => {
    if (loginMode !== 'pairing') {
      setIsScannerVisible(false);
    }
  }, [loginMode]);

  async function submitPairingPayload(payloadText: string) {
    if (pairingSubmitLockedRef.current) {
      return;
    }

    const normalizedPayload = String(payloadText || '').trim();

    if (!normalizedDeviceName) {
      setErrorMessage(t('auth.error.deviceRequired'));
      return;
    }

    if (!normalizedPayload) {
      setErrorMessage(t('auth.error.pairingPayloadRequired'));
      return;
    }

    pairingSubmitLockedRef.current = true;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await loginWithPairingPayload(normalizedPayload, normalizedDeviceName);
      setIsScannerVisible(false);
    } catch (error) {
      setErrorMessage(String((error as Error)?.message || t('auth.error.loginFailed')));
      pairingSubmitLockedRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOpenScanner() {
    if (!normalizedDeviceName) {
      setErrorMessage(t('auth.error.deviceRequired'));
      return;
    }

    if (!cameraPermission?.granted) {
      const nextPermission = await requestCameraPermission();
      if (!nextPermission.granted) {
        setErrorMessage(t('auth.error.cameraPermissionDenied'));
        return;
      }
    }

    setErrorMessage('');
    setIsScannerVisible(true);
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    const data = String(result.data || '').trim();
    if (!data) {
      return;
    }

    submitPairingPayload(data).catch(() => {});
  }

  async function handleSubmit() {
    if (loginMode === 'pairing') {
      await handleOpenScanner();
      return;
    }

    if (!normalizedEndpoint) {
      setErrorMessage(t('auth.error.endpointRequired'));
      return;
    }

    if (!normalizedDeviceName) {
      setErrorMessage(t('auth.error.deviceRequired'));
      return;
    }

    if (!normalizedPassword) {
      setErrorMessage(t('auth.error.passwordRequired'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await loginWithMasterPassword(normalizedEndpoint, normalizedPassword, normalizedDeviceName);
      setMasterPassword('');
    } catch (error) {
      setErrorMessage(String((error as Error)?.message || t('auth.error.loginFailed')));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleQuickProfile(profile: DeviceProfile) {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      activateProfile(profile.desktopDeviceId);
      const restored = await bootstrapAuth(profile.apiBaseUrl);
      if (!restored) {
        throw new Error(t('auth.error.loginFailed'));
      }
    } catch (error) {
      setErrorMessage(String((error as Error)?.message || t('auth.error.loginFailed')));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePastePairingPayload() {
    const text = String(await Clipboard.getStringAsync()).trim();
    if (!text) {
      setErrorMessage(t('auth.error.pairingClipboardEmpty'));
      return;
    }
    await submitPairingPayload(text);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className={SAFE_AREA_CLASS}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        className={KEYBOARD_SHELL_CLASS}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          bounces={false}
          contentContainerStyle={[
            SCROLL_CONTENT_STYLE,
            {
              paddingTop: Math.max(24, insets.top + 8),
              paddingBottom: Math.max(32, insets.bottom + 20)
            }
          ]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className={LOGO_WRAP_CLASS}>
            <Image source={brandAssets.logo} className={LOGO_CLASS} resizeMode="contain" />
          </View>

          <View className={FORM_CARD_CLASS}>
            <View className={MODE_TABS_CLASS}>
              <Pressable
                onPress={() => setLoginMode('pairing')}
                className={cn(MODE_TAB_CLASS, loginMode === 'pairing' && MODE_TAB_ACTIVE_CLASS)}
              >
                <Text className={cn(MODE_TAB_TEXT_CLASS, loginMode === 'pairing' && MODE_TAB_TEXT_ACTIVE_CLASS)}>
                  {t('auth.mode.pairing')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLoginMode('manual')}
                className={cn(MODE_TAB_CLASS, loginMode === 'manual' && MODE_TAB_ACTIVE_CLASS)}
              >
                <Text className={cn(MODE_TAB_TEXT_CLASS, loginMode === 'manual' && MODE_TAB_TEXT_ACTIVE_CLASS)}>
                  {t('auth.mode.manual')}
                </Text>
              </Pressable>
            </View>

            {recentProfiles.length > 0 ? (
              <View className={RECENT_PROFILES_CLASS}>
                {recentProfiles.map((profile) => (
                  <Pressable
                    key={profile.desktopDeviceId}
                    disabled={isSubmitting}
                    onPress={() => {
                      handleQuickProfile(profile).catch(() => {});
                    }}
                    className={RECENT_PROFILE_ROW_CLASS}
                  >
                    <Text className={RECENT_PROFILE_NAME_CLASS} numberOfLines={1}>
                      {profile.displayName}
                    </Text>
                    <Text className={RECENT_PROFILE_META_CLASS} numberOfLines={1}>
                      {getDeviceProfileEndpoint(profile)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View className={INPUT_GROUP_CLASS}>
              <Text className={INPUT_LABEL_CLASS}>{t('auth.device.label')}</Text>
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={setDeviceName}
                placeholder={t('auth.device.placeholder')}
                placeholderTextColor={theme.colors.textTertiary}
                className={INPUT_CLASS}
                value={deviceName}
              />
            </View>

            {loginMode === 'pairing' ? (
              <View className={INPUT_GROUP_CLASS}>
                <View className={INPUT_LABEL_ROW_CLASS}>
                  <Text className={INPUT_LABEL_CLASS}>{t('auth.scan.label')}</Text>
                  <View className={SCAN_ACTIONS_CLASS}>
                    <Pressable
                      disabled={isSubmitting}
                      hitSlop={8}
                      onPress={() => {
                        handlePastePairingPayload().catch((error) => {
                          setErrorMessage(String((error as Error)?.message || t('auth.error.loginFailed')));
                        });
                      }}
                      className={INLINE_ACTION_BUTTON_CLASS}
                    >
                      <Text className={INLINE_ACTION_BUTTON_TEXT_CLASS}>{t('auth.pairingPayload.paste')}</Text>
                    </Pressable>
                    {isScannerVisible ? (
                      <Pressable
                        disabled={isSubmitting}
                        hitSlop={8}
                        onPress={() => {
                          setIsScannerVisible(false);
                        }}
                        className={INLINE_ACTION_BUTTON_CLASS}
                      >
                        <Text className={INLINE_ACTION_BUTTON_TEXT_CLASS}>{t('auth.scan.close')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                {isScannerVisible ? (
                  <View className={SCANNER_SHELL_CLASS}>
                    <CameraView
                      active={!isSubmitting}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      facing="back"
                      onBarcodeScanned={isSubmitting ? undefined : handleBarcodeScanned}
                      onMountError={(event) => {
                        setErrorMessage(event.message || t('auth.scan.mountFailed'));
                        setIsScannerVisible(false);
                      }}
                      style={ABSOLUTE_FILL_STYLE}
                    />
                    <View pointerEvents="none" className={SCANNER_OVERLAY_CLASS}>
                      <View className={SCANNER_FRAME_CLASS} />
                      {isSubmitting ? (
                        <View className={SCANNER_BUSY_PILL_CLASS}>
                          <ActivityIndicator size="small" color={theme.colors.onBrandBlueAction} />
                          <Text className={SCANNER_BUSY_TEXT_CLASS}>{t('auth.scan.connecting')}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ) : (
                  <Pressable
                    disabled={!canSubmit}
                    onPress={() => {
                      handleOpenScanner().catch((error) => {
                        setErrorMessage(String((error as Error)?.message || t('auth.error.loginFailed')));
                      });
                    }}
                    className={cn(SCAN_PLACEHOLDER_CLASS, !canSubmit && SCAN_PLACEHOLDER_DISABLED_CLASS)}
                  >
                    <View className={SCAN_PLACEHOLDER_ICON_CLASS}>
                      <View className={cn(SCAN_CORNER_CLASS, SCAN_CORNER_TOP_LEFT_CLASS)} />
                      <View className={cn(SCAN_CORNER_CLASS, SCAN_CORNER_TOP_RIGHT_CLASS)} />
                      <View className={cn(SCAN_CORNER_CLASS, SCAN_CORNER_BOTTOM_LEFT_CLASS)} />
                      <View className={cn(SCAN_CORNER_CLASS, SCAN_CORNER_BOTTOM_RIGHT_CLASS)} />
                    </View>
                    <Text className={SCAN_PLACEHOLDER_TEXT_CLASS}>{t('auth.scan.hint')}</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <>
                <View className={INPUT_GROUP_CLASS}>
                  <Text className={INPUT_LABEL_CLASS}>{t('auth.endpoint.label')}</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    onChangeText={setEndpointDraft}
                    placeholder={t('auth.endpoint.placeholder')}
                    placeholderTextColor={theme.colors.textTertiary}
                    className={INPUT_CLASS}
                    value={endpointDraft}
                  />
                </View>

                <View className={INPUT_GROUP_CLASS}>
                  <Text className={INPUT_LABEL_CLASS}>{t('auth.password.label')}</Text>
                  <View className={PASSWORD_INPUT_SHELL_CLASS}>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={setMasterPassword}
                      onSubmitEditing={() => {
                        handleSubmit().catch(() => {});
                      }}
                      placeholder={t('auth.password.placeholder')}
                      placeholderTextColor={theme.colors.textTertiary}
                      secureTextEntry={!isPasswordVisible}
                      className={PASSWORD_INPUT_CLASS}
                      value={masterPassword}
                    />
                    <Pressable
                      accessibilityLabel={isPasswordVisible ? t('auth.password.hide') : t('auth.password.show')}
                      hitSlop={10}
                      onPress={() => {
                        setIsPasswordVisible((current) => !current);
                      }}
                      className={EYE_BUTTON_CLASS}
                    >
                      <View className={EYE_ICON_CLASS}>
                        <View className={EYE_OUTLINE_CLASS} />
                        <View className={EYE_PUPIL_CLASS} />
                        {!isPasswordVisible ? <View className={EYE_SLASH_CLASS} /> : null}
                      </View>
                    </Pressable>
                  </View>
                </View>
              </>
            )}

            {errorMessage ? <Text className={ERROR_TEXT_CLASS}>{errorMessage}</Text> : null}

            <Pressable
              disabled={!canSubmit}
              onPress={() => {
                handleSubmit().catch(() => {});
              }}
              className={cn(SUBMIT_BUTTON_CLASS, !canSubmit && SUBMIT_BUTTON_DISABLED_CLASS)}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={theme.colors.onBrandBlueAction} />
              ) : (
                <Text className={SUBMIT_BUTTON_TEXT_CLASS}>
                  {loginMode === 'pairing' ? t('auth.scan.open') : t('auth.submit')}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
