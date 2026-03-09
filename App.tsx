import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';

import { AppProviders } from './src/app/providers/AppProviders';
import { AppRoot } from './src/app/AppRoot';
import { AppToastHost } from './src/app/ui/AppToastHost';
import { AppErrorBoundary } from './src/core/components/AppErrorBoundary';

export default function App() {
  const [appRootKey, setAppRootKey] = useState(0);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <NavigationContainer>
            <AppErrorBoundary onResetToSafeScreen={() => setAppRootKey((prev) => prev + 1)}>
              <AppRoot key={appRootKey} />
            </AppErrorBoundary>
          </NavigationContainer>
          <AppToastHost />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
