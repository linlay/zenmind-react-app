import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { ShellScreenView } from './components/ShellScreenView';
import { useShellScreenController } from './hooks/useShellScreenController';

import { styles } from './ShellScreen.styles';

export function ShellScreen() {
  const controller = useShellScreenController();

  const { theme } = controller;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeRoot, { backgroundColor: theme.surface }]}
      nativeID="shell-root"
      testID="shell-root"
    >
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} animated />
      <ShellScreenView controller={controller} />
    </SafeAreaView>
  );
}
