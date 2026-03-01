import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProviders } from './src/app/providers/AppProviders';
import { AppRoot } from './src/app/AppRoot';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <AppRoot />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
