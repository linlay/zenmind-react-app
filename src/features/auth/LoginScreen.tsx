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
  StyleSheet,
  Text,
  TextInput,
  View
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
import { useAppTheme, useAppThemeStyles } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../shared/visual/foundation';

export function AuthBootstrapScreen() {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.bootstrapShell}>
        <View style={styles.bootstrapCard}>
          <ActivityIndicator size="small" color={theme.colors.brandBlueAction} />
          <Text style={styles.bootstrapText}>{t('auth.bootstrap.restoring')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function LoginScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
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
  const recentProfiles = listDeviceProfiles().filter((profile) => !profile.needsRelink).slice(0, 3);
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
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        style={styles.keyboardShell}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          bounces={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(24, insets.top + 8),
              paddingBottom: Math.max(32, insets.bottom + 20)
            }
          ]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoWrap}>
            <Image source={brandAssets.logo} style={styles.logo} resizeMode="contain" />
          </View>

          <View style={styles.formCard}>
            <View style={styles.modeTabs}>
              <Pressable
                onPress={() => setLoginMode('pairing')}
                style={({ pressed }) => [
                  styles.modeTab,
                  loginMode === 'pairing' ? styles.modeTabActive : null,
                  pressed ? styles.modeTabPressed : null
                ]}
              >
                <Text
                  style={[
                    styles.modeTabText,
                    loginMode === 'pairing' ? styles.modeTabTextActive : null
                  ]}
                >
                  {t('auth.mode.pairing')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLoginMode('manual')}
                style={({ pressed }) => [
                  styles.modeTab,
                  loginMode === 'manual' ? styles.modeTabActive : null,
                  pressed ? styles.modeTabPressed : null
                ]}
              >
                <Text
                  style={[
                    styles.modeTabText,
                    loginMode === 'manual' ? styles.modeTabTextActive : null
                  ]}
                >
                  {t('auth.mode.manual')}
                </Text>
              </Pressable>
            </View>

            {recentProfiles.length > 0 ? (
              <View style={styles.recentProfiles}>
                {recentProfiles.map((profile) => (
                  <Pressable
                    key={profile.desktopDeviceId}
                    disabled={isSubmitting}
                    onPress={() => {
                      handleQuickProfile(profile).catch(() => {});
                    }}
                    style={({ pressed }) => [
                      styles.recentProfileRow,
                      pressed && !isSubmitting ? styles.recentProfileRowPressed : null
                    ]}
                  >
                    <Text style={styles.recentProfileName} numberOfLines={1}>
                      {profile.displayName}
                    </Text>
                    <Text style={styles.recentProfileMeta} numberOfLines={1}>
                      {profile.apiBaseUrl}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('auth.device.label')}</Text>
              <TextInput
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={setDeviceName}
                placeholder={t('auth.device.placeholder')}
                placeholderTextColor={theme.colors.textTertiary}
                style={styles.input}
                value={deviceName}
              />
            </View>

            {loginMode === 'pairing' ? (
              <View style={styles.inputGroup}>
                <View style={styles.inputLabelRow}>
                  <Text style={styles.inputLabel}>{t('auth.scan.label')}</Text>
                  <View style={styles.scanActions}>
                    <Pressable
                      disabled={isSubmitting}
                      hitSlop={8}
                      onPress={() => {
                        handlePastePairingPayload().catch((error) => {
                          setErrorMessage(String((error as Error)?.message || t('auth.error.loginFailed')));
                        });
                      }}
                      style={({ pressed }) => [
                        styles.inlineActionButton,
                        pressed && !isSubmitting ? styles.inlineActionButtonPressed : null
                      ]}
                    >
                      <Text style={styles.inlineActionButtonText}>{t('auth.pairingPayload.paste')}</Text>
                    </Pressable>
                    {isScannerVisible ? (
                      <Pressable
                        disabled={isSubmitting}
                        hitSlop={8}
                        onPress={() => {
                          setIsScannerVisible(false);
                        }}
                        style={({ pressed }) => [
                          styles.inlineActionButton,
                          pressed && !isSubmitting ? styles.inlineActionButtonPressed : null
                        ]}
                      >
                        <Text style={styles.inlineActionButtonText}>{t('auth.scan.close')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                {isScannerVisible ? (
                  <View style={styles.scannerShell}>
                    <CameraView
                      active={!isSubmitting}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      facing="back"
                      onBarcodeScanned={isSubmitting ? undefined : handleBarcodeScanned}
                      onMountError={(event) => {
                        setErrorMessage(event.message || t('auth.scan.mountFailed'));
                        setIsScannerVisible(false);
                      }}
                      style={styles.cameraPreview}
                    />
                    <View pointerEvents="none" style={styles.scannerOverlay}>
                      <View style={styles.scannerFrame} />
                      {isSubmitting ? (
                        <View style={styles.scannerBusyPill}>
                          <ActivityIndicator size="small" color={theme.colors.onBrandBlueAction} />
                          <Text style={styles.scannerBusyText}>{t('auth.scan.connecting')}</Text>
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
                    style={({ pressed }) => [
                      styles.scanPlaceholder,
                      !canSubmit ? styles.scanPlaceholderDisabled : null,
                      pressed && canSubmit ? styles.scanPlaceholderPressed : null
                    ]}
                  >
                    <View style={styles.scanPlaceholderIcon}>
                      <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
                      <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                      <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                      <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />
                    </View>
                    <Text style={styles.scanPlaceholderText}>{t('auth.scan.hint')}</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('auth.endpoint.label')}</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    onChangeText={setEndpointDraft}
                    placeholder={t('auth.endpoint.placeholder')}
                    placeholderTextColor={theme.colors.textTertiary}
                    style={styles.input}
                    value={endpointDraft}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t('auth.password.label')}</Text>
                  <View style={styles.passwordInputShell}>
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
                      style={styles.passwordInput}
                      value={masterPassword}
                    />
                    <Pressable
                      accessibilityLabel={isPasswordVisible ? t('auth.password.hide') : t('auth.password.show')}
                      hitSlop={10}
                      onPress={() => {
                        setIsPasswordVisible((current) => !current);
                      }}
                      style={({ pressed }) => [styles.eyeButton, pressed ? styles.eyeButtonPressed : null]}
                    >
                      <View style={styles.eyeIcon}>
                        <View style={styles.eyeOutline} />
                        <View style={styles.eyePupil} />
                        {!isPasswordVisible ? <View style={styles.eyeSlash} /> : null}
                      </View>
                    </Pressable>
                  </View>
                </View>
              </>
            )}

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              disabled={!canSubmit}
              onPress={() => {
                handleSubmit().catch(() => {});
              }}
              style={({ pressed }) => [
                styles.submitButton,
                !canSubmit ? styles.submitButtonDisabled : null,
                pressed && canSubmit ? styles.submitButtonPressed : null
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={theme.colors.onBrandBlueAction} />
              ) : (
                <Text style={styles.submitButtonText}>
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

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    keyboardShell: {
      flex: 1
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      gap: 18
    },
    logoWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 6,
      paddingBottom: 4
    },
    logo: {
      width: 88,
      height: 88
    },
    formCard: {
      borderRadius: appVisualTokens.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 20,
      paddingVertical: 20,
      borderWidth: 1,
      borderColor: theme.colors.lineStrong,
      gap: 14
    },
    modeTabs: {
      height: 44,
      borderRadius: appVisualTokens.radii.md,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.lineStrong,
      flexDirection: 'row',
      padding: 3,
      gap: 3
    },
    modeTab: {
      flex: 1,
      borderRadius: appVisualTokens.radii.sm,
      alignItems: 'center',
      justifyContent: 'center'
    },
    modeTabActive: {
      backgroundColor: theme.colors.surface
    },
    modeTabPressed: {
      opacity: 0.82
    },
    modeTabText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary
    },
    modeTabTextActive: {
      color: theme.colors.textPrimary
    },
    recentProfiles: {
      borderRadius: appVisualTokens.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.lineStrong,
      overflow: 'hidden'
    },
    recentProfileRow: {
      minHeight: 52,
      paddingHorizontal: 14,
      paddingVertical: 9,
      justifyContent: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line
    },
    recentProfileRowPressed: {
      backgroundColor: theme.colors.surfaceMuted
    },
    recentProfileName: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    recentProfileMeta: {
      marginTop: 2,
      fontSize: 12,
      color: theme.colors.textTertiary
    },
    inputGroup: {
      gap: 8
    },
    inputLabelRow: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap'
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textPrimary
    },
    inlineActionButton: {
      minHeight: 28,
      borderRadius: appVisualTokens.radii.sm,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted
    },
    inlineActionButtonPressed: {
      opacity: 0.78
    },
    inlineActionButtonText: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.colors.brandBlueAction
    },
    scanActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8
    },
    input: {
      height: 52,
      borderRadius: appVisualTokens.radii.md,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.lineStrong,
      paddingHorizontal: 16,
      fontSize: 16,
      color: theme.colors.textPrimary
    },
    scanPlaceholder: {
      minHeight: 188,
      borderRadius: appVisualTokens.radii.lg,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      paddingHorizontal: 18,
      paddingVertical: 20
    },
    scanPlaceholderPressed: {
      backgroundColor: theme.colors.surfaceRaised
    },
    scanPlaceholderDisabled: {
      opacity: 0.48
    },
    scanPlaceholderIcon: {
      width: 86,
      height: 86,
      position: 'relative'
    },
    scanCorner: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderColor: theme.colors.brandBlueAction
    },
    scanCornerTopLeft: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3
    },
    scanCornerTopRight: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3
    },
    scanCornerBottomLeft: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3
    },
    scanCornerBottomRight: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3
    },
    scanPlaceholderText: {
      maxWidth: 260,
      textAlign: 'center',
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textSecondary
    },
    scannerShell: {
      height: 262,
      borderRadius: appVisualTokens.radii.lg,
      overflow: 'hidden',
      backgroundColor: '#111827',
      borderWidth: 1,
      borderColor: theme.colors.lineStrong
    },
    cameraPreview: {
      ...StyleSheet.absoluteFill
    },
    scannerOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.16)'
    },
    scannerFrame: {
      width: 168,
      height: 168,
      borderRadius: appVisualTokens.radii.md,
      borderWidth: 2,
      borderColor: 'rgba(255, 255, 255, 0.92)',
      backgroundColor: 'rgba(255, 255, 255, 0.04)'
    },
    scannerBusyPill: {
      position: 'absolute',
      bottom: 16,
      minHeight: 38,
      borderRadius: 999,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.colors.brandBlueAction
    },
    scannerBusyText: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.colors.onBrandBlueAction
    },
    passwordInputShell: {
      height: 52,
      borderRadius: appVisualTokens.radii.md,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.lineStrong,
      paddingLeft: 16,
      paddingRight: 8,
      flexDirection: 'row',
      alignItems: 'center'
    },
    passwordInput: {
      flex: 1,
      height: '100%',
      fontSize: 16,
      color: theme.colors.textPrimary
    },
    eyeButton: {
      width: 40,
      height: 40,
      borderRadius: appVisualTokens.radii.md,
      alignItems: 'center',
      justifyContent: 'center'
    },
    eyeButtonPressed: {
      backgroundColor: theme.colors.surfaceRaised
    },
    eyeIcon: {
      width: 22,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center'
    },
    eyeOutline: {
      position: 'absolute',
      width: 20,
      height: 12,
      borderWidth: 1.6,
      borderColor: theme.colors.textTertiary,
      borderRadius: 20
    },
    eyePupil: {
      width: 5,
      height: 5,
      borderRadius: 999,
      backgroundColor: theme.colors.textTertiary
    },
    eyeSlash: {
      position: 'absolute',
      width: 22,
      height: 1.8,
      borderRadius: 999,
      backgroundColor: theme.colors.textTertiary,
      transform: [{ rotate: '-32deg' }]
    },
    errorText: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.danger
    },
    submitButton: {
      marginTop: 4,
      minHeight: 54,
      borderRadius: appVisualTokens.radii.lg,
      backgroundColor: theme.colors.brandBlueAction,
      alignItems: 'center',
      justifyContent: 'center'
    },
    submitButtonDisabled: {
      opacity: 0.48
    },
    submitButtonPressed: {
      opacity: 0.86
    },
    submitButtonText: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.onBrandBlueAction
    },
    bootstrapShell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20
    },
    bootstrapCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: appVisualTokens.radii.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.lineStrong,
      paddingHorizontal: 18,
      paddingVertical: 16
    },
    bootstrapText: {
      fontSize: 14,
      color: theme.colors.textSecondary
    }
  });
}
