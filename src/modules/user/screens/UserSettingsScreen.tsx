import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { toBackendBaseUrl, toDefaultPtyWebUrl } from '../../../core/network/endpoint';
import { FONT_MONO } from '../../../core/constants/theme';
import { TAB_LIST_CONTENT_STYLE } from '../../../app/shell/styles/tabPageVisual';
import { StoredAccountSummary } from '../../../core/types/common';
import { applyEndpointDraft, setEndpointDraft, setPtyUrlDraft } from '../state/userSlice';

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

interface UserSettingsScreenProps {
  theme: {
    mode: 'light' | 'dark';
    surfaceStrong: string;
    surface: string;
    text: string;
    textMute: string;
    textSoft: string;
    primary: string;
    primaryDeep: string;
    danger: string;
    border: string;
  };
  onSettingsApplied?: () => void;
  username: string;
  deviceName: string;
  accessToken: string;
  versionLabel: string;
  savedAccounts: StoredAccountSummary[];
  activeAccountId: string;
  accountSwitching: boolean;
  loginEndpointDraft: string;
  loginDeviceName: string;
  loginMasterPassword: string;
  loginAuthError: string;
  canSubmitLogin: boolean;
  onClearChatCache: () => Promise<void>;
  onLogout: () => void;
  onSwitchAccount: (accountId: string) => Promise<{ success: boolean }>;
  onRemoveAccount: (accountId: string) => Promise<void>;
  onSetLoginEndpointDraft: (value: string) => void;
  onSetLoginDeviceName: (value: string) => void;
  onSetLoginMasterPassword: (value: string) => void;
  onSetLoginAuthError: (value: string) => void;
  onSubmitLogin: () => Promise<void>;
}

export function UserSettingsScreen({
  theme,
  onSettingsApplied,
  username,
  deviceName,
  accessToken,
  versionLabel,
  savedAccounts,
  activeAccountId,
  accountSwitching,
  loginEndpointDraft,
  loginDeviceName,
  loginMasterPassword,
  loginAuthError,
  canSubmitLogin,
  onClearChatCache,
  onLogout,
  onSwitchAccount,
  onRemoveAccount,
  onSetLoginEndpointDraft,
  onSetLoginDeviceName,
  onSetLoginMasterPassword,
  onSetLoginAuthError,
  onSubmitLogin
}: UserSettingsScreenProps) {
  const dispatch = useAppDispatch();
  const [clearingCache, setClearingCache] = useState(false);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const { endpointDraft, ptyUrlDraft, endpointInput, ptyUrlInput } = useAppSelector((state) => state.user);

  const backendUrl = toBackendBaseUrl(endpointInput);

  const handleApply = async () => {
    dispatch(applyEndpointDraft());
    onSettingsApplied?.();
  };

  const truncatedToken = accessToken
    ? accessToken.length > 20
      ? accessToken.slice(0, 10) + '...' + accessToken.slice(-6)
      : accessToken
    : '(无)';

  const handleCopyToken = async () => {
    if (!accessToken) return;
    await Clipboard.setStringAsync(accessToken);
    Alert.alert('已复制', 'Access Token 已复制到剪贴板');
  };

  const handleLogoutPress = () => {
    Alert.alert('确认登出', '登出后会删除当前账号在本机保存的登录凭证，确定继续？', [
      { text: '取消', style: 'cancel' },
      { text: '登出', style: 'destructive', onPress: onLogout }
    ]);
  };

  const runClearChatCache = async () => {
    if (clearingCache) {
      return;
    }
    setClearingCache(true);
    try {
      await onClearChatCache();
    } finally {
      setClearingCache(false);
    }
  };

  const handleClearChatCachePress = () => {
    if (clearingCache) {
      return;
    }

    Alert.alert('确认清除聊天缓存', '会清空当前账号在本机的聊天缓存，并立即重新拉取远端聊天数据。账号、设置和服务端数据不会受影响，确定继续？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清除',
        style: 'destructive',
        onPress: () => {
          runClearChatCache().catch(() => {});
        }
      }
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.surface }]}
      contentContainerStyle={styles.scrollContent}
      nativeID="settings-root"
      testID="settings-root"
    >
      <View
        style={[styles.settingCard, { backgroundColor: theme.surfaceStrong }]}
        nativeID="settings-card"
        testID="settings-card"
      >
        <View style={styles.settingRowHead}>
          <Text style={[styles.title, { color: theme.text }]}>软件配置</Text>
        </View>

        <Text style={styles.label}>后端域名 / IP</Text>
        <TextInput
          value={endpointDraft}
          onChangeText={(text) => dispatch(setEndpointDraft(text))}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="api.example.com 或 192.168.1.8:8080"
          placeholderTextColor={theme.textMute}
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
          nativeID="endpoint-input"
          testID="endpoint-input"
        />
        <Text style={styles.hint}>当前连接：{backendUrl}</Text>

        <TouchableOpacity
          activeOpacity={0.74}
          style={[styles.quickBtn, { backgroundColor: theme.surface }]}
          testID="use-local-debug-btn"
          onPress={() => {
            dispatch(setEndpointDraft('http://localhost:8080'));
            dispatch(setPtyUrlDraft('http://localhost:11931/appterm'));
          }}
        >
          <Text style={[styles.quickBtnText, { color: theme.textSoft }]}>切换到本地调试（localhost:8080）</Text>
        </TouchableOpacity>

        <Text style={[styles.label, styles.labelOffset]}>PTY 前端地址</Text>
        <TextInput
          value={ptyUrlDraft}
          onChangeText={(text) => dispatch(setPtyUrlDraft(text))}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://api.example.com/appterm"
          placeholderTextColor={theme.textMute}
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
          nativeID="pty-url-input"
          testID="pty-url-input"
        />
        <TouchableOpacity
          activeOpacity={0.74}
          style={[styles.quickBtn, { backgroundColor: theme.surface }]}
          testID="generate-pty-url-btn"
          onPress={() => dispatch(setPtyUrlDraft(toDefaultPtyWebUrl(endpointDraft)))}
        >
          <Text style={[styles.quickBtnText, { color: theme.textSoft }]}>按后端地址生成默认 PTY 地址</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>当前 PTY：{ptyUrlInput}</Text>

        <TouchableOpacity activeOpacity={0.82} style={styles.applyBtn} testID="save-settings-btn" onPress={handleApply}>
          <LinearGradient colors={[theme.primary, theme.primaryDeep]} style={styles.applyGradient}>
            <Text style={styles.applyText}>保存设置</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View style={[styles.settingCard, { backgroundColor: theme.surfaceStrong }]} testID="account-settings-card">
        <View style={styles.settingRowHead}>
          <Text style={[styles.title, { color: theme.text }]}>账号管理</Text>
        </View>

        <Text style={[styles.cacheDescription, { color: theme.textMute }]}>
          当前仅保存设备凭证，不保存主密码。切换账号时会隔离聊天缓存。
        </Text>

        <View style={styles.accountsList}>
          {savedAccounts.length ? (
            savedAccounts.map((account, index) => {
              const isActive = account.accountId === activeAccountId;
              const title = account.username || account.endpointInput || '(未命名账号)';

              return (
                <View
                  key={account.accountId}
                  style={[styles.accountItem, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  testID={`settings-account-item-${index}`}
                >
                  <View style={styles.accountItemText}>
                    <View style={styles.accountItemHeader}>
                      <Text style={[styles.accountItemTitle, { color: theme.text }]} numberOfLines={1}>
                        {title}
                      </Text>
                      {isActive ? (
                        <View style={[styles.accountBadge, { backgroundColor: theme.primaryDeep }]}>
                          <Text style={styles.accountBadgeText}>当前</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.accountItemMeta, { color: theme.textMute }]} numberOfLines={1}>
                      {account.deviceName || '(未命名设备)'}
                    </Text>
                    <Text style={[styles.accountItemMeta, { color: theme.textMute }]} numberOfLines={1}>
                      {account.endpointInput}
                    </Text>
                    <Text style={[styles.accountItemMeta, { color: theme.textMute }]} numberOfLines={1}>
                      {formatLastUsedAt(account.lastUsedAtMs)}
                    </Text>
                  </View>

                  <View style={styles.accountActions}>
                    {isActive ? (
                      <View style={[styles.accountHintPill, { borderColor: theme.border }]}>
                        <Text style={[styles.accountHintPillText, { color: theme.textSoft }]}>当前会话</Text>
                      </View>
                    ) : (
                      <>
                        <TouchableOpacity
                          activeOpacity={0.82}
                          style={[
                            styles.accountActionPrimary,
                            { backgroundColor: theme.primary, opacity: accountSwitching ? 0.56 : 1 }
                          ]}
                          disabled={accountSwitching}
                          onPress={() => {
                            onSwitchAccount(account.accountId).catch(() => {});
                          }}
                          testID={`settings-switch-account-btn-${index}`}
                        >
                          <Text style={styles.accountActionPrimaryText}>切换</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.82}
                          style={[styles.accountActionGhost, { borderColor: theme.border }]}
                          onPress={() => {
                            Alert.alert('移除已保存账号', '仅删除本机保存的登录凭证，不会影响服务端账号，确定继续？', [
                              { text: '取消', style: 'cancel' },
                              {
                                text: '移除',
                                style: 'destructive',
                                onPress: () => {
                                  onRemoveAccount(account.accountId).catch(() => {});
                                }
                              }
                            ]);
                          }}
                          testID={`settings-remove-account-btn-${index}`}
                        >
                          <Text style={[styles.accountActionGhostText, { color: theme.textSoft }]}>移除</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptyText, { color: theme.textMute }]}>当前还没有已保存账号</Text>
          )}
        </View>

        <TouchableOpacity
          activeOpacity={0.78}
          style={[styles.quickBtn, { backgroundColor: theme.surface }]}
          onPress={() => {
            setShowAddAccountForm((prev) => !prev);
            onSetLoginAuthError('');
          }}
          testID="toggle-add-account-form-btn"
        >
          <Text style={[styles.quickBtnText, { color: theme.textSoft }]}>
            {showAddAccountForm ? '收起添加账号表单' : '添加新账号'}
          </Text>
        </TouchableOpacity>

        {showAddAccountForm ? (
          <View style={styles.addAccountForm}>
            <Text style={[styles.label, styles.labelCompact]}>后端域名 / IP</Text>
            <TextInput
              value={loginEndpointDraft}
              onChangeText={onSetLoginEndpointDraft}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="api.example.com 或 192.168.1.8:8080"
              placeholderTextColor={theme.textMute}
              style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
              testID="settings-add-account-endpoint-input"
            />

            <Text style={[styles.label, styles.labelCompact]}>设备名称</Text>
            <TextInput
              value={loginDeviceName}
              onChangeText={onSetLoginDeviceName}
              placeholder="设备名称"
              placeholderTextColor={theme.textMute}
              style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
              testID="settings-add-account-device-name-input"
            />

            <Text style={[styles.label, styles.labelCompact]}>主密码</Text>
            <TextInput
              value={loginMasterPassword}
              onChangeText={onSetLoginMasterPassword}
              placeholder="主密码"
              placeholderTextColor={theme.textMute}
              secureTextEntry
              style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
              testID="settings-add-account-password-input"
            />

            {loginAuthError ? <Text style={[styles.error, { color: theme.danger }]}>{loginAuthError}</Text> : null}

            <TouchableOpacity
              activeOpacity={0.82}
              style={[
                styles.submitBtn,
                {
                  backgroundColor: theme.primary,
                  borderColor: theme.primaryDeep,
                  opacity: canSubmitLogin && !accountSwitching ? 1 : 0.56
                }
              ]}
              onPress={() => {
                onSubmitLogin().catch(() => {});
              }}
              disabled={!canSubmitLogin || accountSwitching}
              testID="settings-add-account-submit-btn"
            >
              <Text style={styles.submitBtnText}>登录并切换到该账号</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={[styles.settingCard, { backgroundColor: theme.surfaceStrong }]} testID="user-info-card">
        <View style={styles.settingRowHead}>
          <Text style={[styles.title, { color: theme.text }]}>用户信息</Text>
        </View>

        <Text style={styles.label}>用户名</Text>
        <View style={[styles.readonlyField, { backgroundColor: theme.surface }]}>
          <Text style={[styles.readonlyText, { color: theme.text }]}>{username || '(未知)'}</Text>
        </View>

        <Text style={[styles.label, styles.labelOffset]}>设备名称</Text>
        <View style={[styles.readonlyField, { backgroundColor: theme.surface }]}>
          <Text style={[styles.readonlyText, { color: theme.text }]}>{deviceName || '(未知)'}</Text>
        </View>

        <Text style={[styles.label, styles.labelOffset]}>Access Token</Text>
        <View style={[styles.tokenRow, { backgroundColor: theme.surface }]}>
          <Text style={[styles.tokenText, { color: theme.textSoft, fontFamily: FONT_MONO }]} numberOfLines={1}>
            {truncatedToken}
          </Text>
          <TouchableOpacity
            activeOpacity={0.72}
            style={[styles.copyBtn, { borderColor: theme.border }]}
            onPress={handleCopyToken}
            testID="copy-token-btn"
          >
            <Text style={[styles.copyBtnText, { color: theme.primaryDeep }]}>复制</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, styles.labelOffset]}>软件版本</Text>
        <View style={[styles.readonlyField, { backgroundColor: theme.surface }]}>
          <Text style={[styles.readonlyText, { color: theme.textMute }]}>{versionLabel}</Text>
        </View>
      </View>

      <View style={[styles.settingCard, { backgroundColor: theme.surfaceStrong }]} testID="cache-settings-card">
        <View style={styles.settingRowHead}>
          <Text style={[styles.title, { color: theme.text }]}>缓存管理</Text>
        </View>

        <Text style={[styles.cacheDescription, { color: theme.textMute }]}>
          仅清理当前账号在本机 SQLite 中的聊天缓存，不影响账号、设置和服务端数据
        </Text>

        <TouchableOpacity
          activeOpacity={0.78}
          style={[
            styles.cacheActionBtn,
            { backgroundColor: theme.surface, borderColor: theme.border },
            clearingCache ? styles.cacheActionBtnDisabled : null
          ]}
          onPress={handleClearChatCachePress}
          disabled={clearingCache}
          testID="clear-chat-cache-btn"
        >
          <Text style={[styles.cacheActionText, { color: theme.primaryDeep }]}>
            {clearingCache ? '清理中...' : '清除聊天缓存'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.78}
        style={[styles.logoutBtn, { borderColor: theme.danger }]}
        onPress={handleLogoutPress}
        testID="logout-btn"
      >
        <Text style={[styles.logoutText, { color: theme.danger }]}>登出当前账号</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 14
  },
  scrollContent: {
    paddingBottom: TAB_LIST_CONTENT_STYLE.paddingBottom,
    gap: 10
  },
  settingCard: {
    borderRadius: 14,
    padding: 14
  },
  settingRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 6
  },
  title: {
    fontSize: 19,
    fontWeight: '700'
  },
  label: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#60728f'
  },
  labelOffset: {
    marginTop: 12
  },
  labelCompact: {
    marginTop: 0
  },
  input: {
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'center'
  },
  hint: {
    marginTop: 6,
    color: '#8d9bb2',
    fontSize: 11
  },
  quickBtn: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center'
  },
  quickBtnText: {
    fontSize: 12,
    fontWeight: '600'
  },
  applyBtn: {
    marginTop: 12,
    borderRadius: 10,
    overflow: 'hidden'
  },
  applyGradient: {
    paddingVertical: 11,
    alignItems: 'center'
  },
  applyText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14
  },
  accountsList: {
    marginTop: 12,
    gap: 8
  },
  accountItem: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 10
  },
  accountItemText: {
    gap: 3
  },
  accountItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  accountItemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700'
  },
  accountBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  accountBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700'
  },
  accountItemMeta: {
    fontSize: 11
  },
  accountActions: {
    flexDirection: 'row',
    gap: 8
  },
  accountActionPrimary: {
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  accountActionPrimaryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  accountActionGhost: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  accountActionGhostText: {
    fontSize: 12,
    fontWeight: '600'
  },
  accountHintPill: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  accountHintPillText: {
    fontSize: 12,
    fontWeight: '600'
  },
  addAccountForm: {
    marginTop: 12,
    gap: 8
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
    fontSize: 14,
    fontWeight: '700'
  },
  readonlyField: {
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
    justifyContent: 'center'
  },
  readonlyText: {
    fontSize: 13
  },
  tokenRow: {
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  tokenText: {
    flex: 1,
    fontSize: 12,
    minWidth: 0
  },
  copyBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '600'
  },
  cacheDescription: {
    fontSize: 12,
    lineHeight: 18
  },
  cacheActionBtn: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth
  },
  cacheActionBtnDisabled: {
    opacity: 0.6
  },
  cacheActionText: {
    fontSize: 13,
    fontWeight: '700'
  },
  emptyText: {
    marginTop: 12,
    fontSize: 12
  },
  logoutBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center'
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600'
  }
});
