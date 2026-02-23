import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { toBackendBaseUrl, toDefaultPtyWebUrl } from '../../../core/network/endpoint';
import { patchSettings } from '../../../core/storage/settingsStorage';
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
  };
  onSettingsApplied?: () => void;
}

export function UserSettingsScreen({ theme, onSettingsApplied }: UserSettingsScreenProps) {
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

  return (
    <View style={styles.container} nativeID="settings-root" testID="settings-root">
      <View
        style={[styles.settingCard, { backgroundColor: theme.surfaceStrong }]}
        nativeID="settings-card"
        testID="settings-card"
      >
        <View style={styles.settingRowHead}>
          <Text style={[styles.title, { color: theme.text }]}>用户配置</Text>
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: 10,
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
    fontSize: 16,
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
  }
});
