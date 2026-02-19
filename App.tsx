import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from './src/app/providers/AppProviders';
import { AppRoot } from './src/app/AppRoot';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <AppRoot />
      </AppProviders>
    </SafeAreaProvider>
  );
}
