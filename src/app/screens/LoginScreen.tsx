import {
  Alert,
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
import { useAppTheme } from '../hooks/useAppTheme';

function formatLastUsedAt(lastUsedAtMs: number): string {
  if (!Number.isFinite(lastUsedAtMs) || lastUsedAtMs <= 0) {
    return '最近使用时间未知';
  }

  try {
    return `最近使用：${new Date(lastUsedAtMs).toLocaleString()}`;
  } catch {
    return '最近使用时间未知';
  }
}

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
  const theme = useAppTheme();
  const {
    endpointDraft,
    deviceName,
    masterPassword,
    authError,
    canSubmitLogin,
    appVersionLabel,
    savedAccounts,
    activeAccountId,
    isSwitchingAccount,
    setEndpointDraftText,
    setDeviceName,
    setMasterPassword,
    submitLogin,
    switchToSavedAccount,
    removeSavedAccount
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
              {savedAccounts.length ? (
                <View style={styles.savedAccountsSection} testID="saved-accounts-card">
                  <Text style={[styles.savedAccountsTitle, { color: theme.text }]}>已保存账号</Text>
                  <View style={styles.savedAccountsList}>
                    {savedAccounts.map((account, index) => {
                      const title = account.username || account.endpointInput || '(未命名账号)';
                      const isActive = account.accountId === activeAccountId;

                      return (
                        <View
                          key={account.accountId}
                          style={[styles.savedAccountItem, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
                          testID={`saved-account-item-${index}`}
                        >
                          <View style={styles.savedAccountTextWrap}>
                            <Text style={[styles.savedAccountTitle, { color: theme.text }]} numberOfLines={1}>
                              {title}
                            </Text>
                            <Text style={[styles.savedAccountMeta, { color: theme.textMute }]} numberOfLines={1}>
                              {account.deviceName || '(未命名设备)'}
                            </Text>
                            <Text style={[styles.savedAccountMeta, { color: theme.textMute }]} numberOfLines={1}>
                              {account.endpointInput}
                            </Text>
                            <Text style={[styles.savedAccountMeta, { color: theme.textMute }]} numberOfLines={1}>
                              {formatLastUsedAt(account.lastUsedAtMs)}
                            </Text>
                          </View>

                          <View style={styles.savedAccountActions}>
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={[
                                styles.savedAccountButton,
                                { backgroundColor: theme.primary, opacity: isSwitchingAccount ? 0.56 : 1 }
                              ]}
                              disabled={isSwitchingAccount}
                              onPress={() => {
                                switchToSavedAccount(account.accountId).catch(() => {});
                              }}
                              testID={`saved-account-switch-btn-${index}`}
                            >
                              <Text style={styles.savedAccountButtonText}>{isActive ? '进入当前账号' : '进入该账号'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={[styles.savedAccountGhostButton, { borderColor: theme.border }]}
                              onPress={() => {
                                Alert.alert('移除已保存账号', '仅删除本机保存的登录凭证，不会影响服务端账号，确定继续？', [
                                  { text: '取消', style: 'cancel' },
                                  {
                                    text: '移除',
                                    style: 'destructive',
                                    onPress: () => {
                                      removeSavedAccount(account.accountId).catch(() => {});
                                    }
                                  }
                                ]);
                              }}
                              testID={`saved-account-remove-btn-${index}`}
                            >
                              <Text style={[styles.savedAccountGhostButtonText, { color: theme.textSoft }]}>移除</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

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
  savedAccountsSection: {
    marginBottom: 6,
    gap: 8
  },
  savedAccountsTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  savedAccountsList: {
    gap: 8
  },
  savedAccountItem: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10
  },
  savedAccountTextWrap: {
    gap: 3
  },
  savedAccountTitle: {
    fontSize: 14,
    fontWeight: '700'
  },
  savedAccountMeta: {
    fontSize: 11
  },
  savedAccountActions: {
    flexDirection: 'row',
    gap: 8
  },
  savedAccountButton: {
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  savedAccountButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  savedAccountGhostButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  savedAccountGhostButtonText: {
    fontSize: 12,
    fontWeight: '600'
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
