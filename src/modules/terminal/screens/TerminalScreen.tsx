import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { normalizePtyUrlInput } from '../../../core/network/endpoint';
import { reloadPty, setPtyLoadError, setPtyLoading } from '../state/terminalSlice';
import { TerminalWebView } from '../components/TerminalWebView';

interface TerminalScreenProps {
  theme: {
    surfaceStrong: string;
    surface: string;
    text: string;
    primaryDeep: string;
  };
}

export function TerminalScreen({ theme }: TerminalScreenProps) {
  const dispatch = useAppDispatch();
  const endpointInput = useAppSelector((state) => state.user.endpointInput);
  const ptyUrlInput = useAppSelector((state) => state.user.ptyUrlInput);
  const { ptyReloadKey, ptyLoading, ptyLoadError } = useAppSelector((state) => state.terminal);

  const ptyWebUrl = normalizePtyUrlInput(ptyUrlInput, endpointInput);

  return (
    <View style={styles.container}>
      <View style={[styles.head, { backgroundColor: theme.surfaceStrong }]}> 
        <Text style={[styles.title, { color: theme.text }]}>PTY 模式</Text>
        <TouchableOpacity
          activeOpacity={0.78}
          style={[styles.actionBtn, { backgroundColor: theme.surface }]}
          onPress={() => dispatch(reloadPty())}
        >
          <Text style={[styles.actionText, { color: theme.primaryDeep }]}>刷新</Text>
        </TouchableOpacity>
      </View>

      <TerminalWebView
        uri={ptyWebUrl}
        reloadKey={ptyReloadKey}
        loading={ptyLoading}
        error={ptyLoadError}
        theme={{ ...theme, textSoft: '#60728f', danger: '#d65252', textMute: '#8d9bb2', primary: '#2f6cf3' }}
        onLoadStart={() => {
          dispatch(setPtyLoading(true));
          dispatch(setPtyLoadError(''));
        }}
        onLoadEnd={() => dispatch(setPtyLoading(false))}
        onError={(message) => {
          dispatch(setPtyLoadError(message));
          dispatch(setPtyLoading(false));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10
  },
  head: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    fontSize: 16,
    fontWeight: '700'
  },
  actionBtn: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700'
  }
});
