import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LoginController } from '../hooks/useLoginController';

interface LoginScreenProps {
  /** 登录控制器 */
  controller: LoginController;
}

/**
 * 登录表单屏幕
 *
 * 显示设备登录表单，包括：
 * - 端点输入框
 * - 设备名称输入框
 * - 主密码输入框
 * - 错误提示
 * - 登录按钮
 * - 底部版本号
 */
export function LoginScreen({ controller }: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    endpointDraft,
    deviceName,
    masterPassword,
    authError,
    canSubmitLogin,
    appVersionLabel,
    theme,
    setEndpointDraftText,
    setDeviceName,
    setMasterPassword,
    submitLogin
  } = controller;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.surface }]}>
      <KeyboardAvoidingView
        style={[styles.fill, { backgroundColor: theme.surface }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          contentContainerStyle={styles.formScrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.formWrap, { paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }]}>
            <View
              style={[
                styles.formCard,
                {
                  borderColor: theme.border,
                  width: '100%',
                  maxWidth: 440
                }
              ]}
            >
              <Text style={[styles.title, { color: theme.text }]}>设备登录</Text>
              <Text style={[styles.hint, { color: theme.textMute }]}>请先填写后端地址，再输入主密码完成设备授权。</Text>

              <TextInput
                value={endpointDraft}
                onChangeText={setEndpointDraftText}
                placeholder="后端域名 / IP（如 api.example.com 或 192.168.1.8:8080）"
                placeholderTextColor={theme.textMute}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { backgroundColor: theme.surfaceStrong, color: theme.text }]}
              />

              <TextInput
                value={deviceName}
                onChangeText={setDeviceName}
                placeholder="设备名称"
                placeholderTextColor={theme.textMute}
                style={[styles.input, { backgroundColor: theme.surfaceStrong, color: theme.text }]}
              />

              <TextInput
                value={masterPassword}
                onChangeText={setMasterPassword}
                placeholder="主密码"
                placeholderTextColor={theme.textMute}
                secureTextEntry
                style={[styles.input, { backgroundColor: theme.surfaceStrong, color: theme.text }]}
              />

              {authError ? <Text style={[styles.error, { color: theme.danger }]}>{authError}</Text> : null}

              <TouchableOpacity
                activeOpacity={0.82}
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: theme.primary,
                    borderColor: theme.primaryDeep,
                    opacity: canSubmitLogin ? 1 : 0.56
                  }
                ]}
                onPress={() => {
                  submitLogin().catch(() => {});
                }}
                testID="app-login-submit-btn"
                disabled={!canSubmitLogin}
              >
                <Text style={styles.submitBtnText}>登录设备</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
        <Text
          style={[styles.versionText, { color: theme.textMute, bottom: insets.bottom + 12 }]}
          testID="login-version-label"
        >
          {appVersionLabel}
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  fill: {
    flex: 1
  },
  formScrollContent: {
    flexGrow: 1
  },
  formWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  formCard: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10
  },
  title: {
    fontSize: 18,
    fontWeight: '600'
  },
  hint: {
    fontSize: 12,
    textAlign: 'left'
  },
  input: {
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'center'
  },
  error: {
    fontSize: 12,
    textAlign: 'left'
  },
  submitBtn: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    alignSelf: 'stretch'
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  versionText: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: 11,
    textAlign: 'center'
  }
});
