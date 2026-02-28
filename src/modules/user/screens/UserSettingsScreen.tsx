import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { toBackendBaseUrl, toDefaultPtyWebUrl } from '../../../core/network/endpoint';
import { patchSettings } from '../../../core/storage/settingsStorage';
import { FONT_MONO } from '../../../core/constants/theme';
import {
  applyEndpointDraft,
  setEndpointDraft,
  setPtyUrlDraft
} from '../state/userSlice';

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
  onLogout: () => void;
}

export function UserSettingsScreen({ theme, onSettingsApplied, username, deviceName, accessToken, versionLabel, onLogout }: UserSettingsScreenProps) {
  const dispatch = useAppDispatch();
  const {
    endpointDraft,
    ptyUrlDraft,
    endpointInput,
    ptyUrlInput,
    selectedAgentKey,
    activeDomain,
    themeMode
  } = useAppSelector((state) => state.user);

  const backendUrl = toBackendBaseUrl(endpointInput);

  const handleApply = async () => {
    dispatch(applyEndpointDraft());

    const nextState = {
      themeMode,
      endpointInput: endpointDraft,
      ptyUrlInput: ptyUrlDraft,
      selectedAgentKey,
      activeDomain
    };

    await patchSettings(nextState);
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
    Alert.alert('确认登出', '登出后需要重新输入密码登录，确定继续？', [
      { text: '取消', style: 'cancel' },
      { text: '登出', style: 'destructive', onPress: onLogout }
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} nativeID="settings-root" testID="settings-root">
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

        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.applyBtn}
          testID="save-settings-btn"
          onPress={handleApply}
        >
          <LinearGradient colors={[theme.primary, theme.primaryDeep]} style={styles.applyGradient}>
            <Text style={styles.applyText}>保存设置</Text>
          </LinearGradient>
        </TouchableOpacity>
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

      <TouchableOpacity
        activeOpacity={0.78}
        style={[styles.logoutBtn, { borderColor: theme.danger }]}
        onPress={handleLogoutPress}
        testID="logout-btn"
      >
        <Text style={[styles.logoutText, { color: theme.danger }]}>登出当前设备</Text>
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
    paddingBottom: 30,
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
