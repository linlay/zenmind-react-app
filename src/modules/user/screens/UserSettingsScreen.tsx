import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { toBackendBaseUrl, toDefaultPtyWebUrl } from '../../../core/network/endpoint';
import { patchSettings } from '../../../core/storage/settingsStorage';
import {
  applyEndpointDraft,
  setEndpointDraft,
  setPtyUrlDraft,
  setThemeMode,
  toggleTheme
} from '../state/userSlice';
import { UserWebViewPlaceholder } from '../components/UserWebViewPlaceholder';

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
    <View style={styles.container}>
      <View style={[styles.settingCard, { backgroundColor: theme.surfaceStrong }]}> 
        <View style={styles.settingRowHead}>
          <Text style={[styles.title, { color: theme.text }]}>用户配置</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.themeBtn, { backgroundColor: theme.surface }]}
            onPress={async () => {
              dispatch(toggleTheme());
              const nextMode = themeMode === 'light' ? 'dark' : 'light';
              dispatch(setThemeMode(nextMode));
              await patchSettings({ themeMode: nextMode });
            }}
          >
            <Text style={[styles.themeBtnText, { color: theme.primaryDeep }]}>{theme.mode === 'light' ? '◐' : '◑'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>后端域名 / IP</Text>
        <TextInput
          value={endpointDraft}
          onChangeText={(text) => dispatch(setEndpointDraft(text))}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="agw.linlay.cc 或 192.168.1.8:8080"
          placeholderTextColor={theme.textMute}
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
        />
        <Text style={styles.hint}>当前连接：{backendUrl}</Text>

        <Text style={[styles.label, styles.labelOffset]}>PTY 前端地址</Text>
        <TextInput
          value={ptyUrlDraft}
          onChangeText={(text) => dispatch(setPtyUrlDraft(text))}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://agw.linlay.cc:11949"
          placeholderTextColor={theme.textMute}
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
        />
        <TouchableOpacity
          activeOpacity={0.74}
          style={[styles.quickBtn, { backgroundColor: theme.surface }]}
          onPress={() => dispatch(setPtyUrlDraft(toDefaultPtyWebUrl(endpointDraft)))}
        >
          <Text style={[styles.quickBtnText, { color: theme.textSoft }]}>按后端地址生成默认 PTY 地址</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>当前 PTY：{ptyUrlInput}</Text>

        <TouchableOpacity activeOpacity={0.82} style={styles.applyBtn} onPress={handleApply}>
          <LinearGradient colors={[theme.primary, theme.primaryDeep]} style={styles.applyGradient}>
            <Text style={styles.applyText}>保存设置</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <UserWebViewPlaceholder />
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
    justifyContent: 'space-between',
    marginBottom: 6
  },
  title: {
    fontSize: 16,
    fontWeight: '700'
  },
  themeBtn: {
    borderRadius: 10,
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  themeBtnText: {
    fontSize: 18,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13
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
