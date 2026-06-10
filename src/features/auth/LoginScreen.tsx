import { useEffect, useMemo, useState } from 'react';
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

import { loginWithMasterPassword, readPreferredDeviceName } from '../../core/auth/appAuth';
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
  const [endpointDraft, setEndpointDraft] = useState(() => readResolvedApiBaseUrl());
  const [deviceName, setDeviceName] = useState(() => readPreferredDeviceName());
  const [masterPassword, setMasterPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const normalizedEndpoint = useMemo(() => normalizeApiBaseUrl(endpointDraft), [endpointDraft]);
  const normalizedDeviceName = useMemo(() => String(deviceName || '').trim(), [deviceName]);
  const normalizedPassword = useMemo(() => String(masterPassword || '').trim(), [masterPassword]);
  const canSubmit = Boolean(normalizedEndpoint && normalizedDeviceName && normalizedPassword && !isSubmitting);

  useEffect(() => {
    if (!normalizedEndpoint) {
      setErrorMessage(t('auth.error.endpointRequired'));
      return;
    }

    setErrorMessage('');
  }, [normalizedEndpoint, t]);

  async function handleSubmit() {
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
                <Text style={styles.submitButtonText}>{t('auth.submit')}</Text>
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
    inputGroup: {
      gap: 8
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textPrimary
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
