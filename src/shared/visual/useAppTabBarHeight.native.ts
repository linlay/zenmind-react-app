import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAppTabBarMetrics } from './tabBarMetrics';

export function useAppTabBarHeight() {
  const insets = useSafeAreaInsets();

  return getAppTabBarMetrics(insets.bottom).height;
}
