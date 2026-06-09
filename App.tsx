import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppRoot } from './src/app/AppRoot';
import { AppLaunchSkeleton } from './src/app/startup/AppLaunchSkeleton';
import { I18nProvider } from './src/shared/i18n';

const NATIVE_SPLASH_FADE_DURATION_MS = 220;
// Increase this value to keep the React-side launch animation visible longer after handoff.
const APP_LAUNCH_OVERLAY_MIN_VISIBLE_MS = 1400;

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore repeated or unsupported calls; the app still boots normally.
});
SplashScreen.setOptions({
  duration: NATIVE_SPLASH_FADE_DURATION_MS,
  fade: true
});

export default function App() {
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [hasOverlayMinimumDurationElapsed, setHasOverlayMinimumDurationElapsed] = useState(false);
  const [isNativeSplashHidden, setIsNativeSplashHidden] = useState(false);
  const [shouldRenderLaunchSkeleton, setShouldRenderLaunchSkeleton] = useState(true);

  useEffect(() => {
    if (!isNativeSplashHidden) {
      return;
    }

    const timerId = setTimeout(() => {
      setHasOverlayMinimumDurationElapsed(true);
    }, APP_LAUNCH_OVERLAY_MIN_VISIBLE_MS);

    return () => {
      clearTimeout(timerId);
    };
  }, [isNativeSplashHidden]);

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <View style={{ flex: 1 }}>
          <AppRoot onNavigationReady={() => setIsNavigationReady(true)} />
          {shouldRenderLaunchSkeleton ? (
            <AppLaunchSkeleton
              dismiss={isNativeSplashHidden && isNavigationReady && hasOverlayMinimumDurationElapsed}
              motionEnabled={isNativeSplashHidden}
              onHidden={() => setShouldRenderLaunchSkeleton(false)}
              onReady={() => {
                SplashScreen.hideAsync()
                  .catch(() => {
                    // Expo Go and repeated hides can reject; fall through to React overlay.
                  })
                  .finally(() => {
                    setIsNativeSplashHidden(true);
                  });
              }}
            />
          ) : null}
        </View>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
