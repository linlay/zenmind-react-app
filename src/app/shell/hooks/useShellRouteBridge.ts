import { useEffect } from 'react';
import { NavigationProp, ParamListBase } from '@react-navigation/native';

interface UseShellRouteBridgeOptions {
  navigation: NavigationProp<ParamListBase>;
  onBindNavigation?: (navigation: NavigationProp<ParamListBase>) => void;
  onFocus?: () => void;
}

export function useShellRouteBridge({ navigation, onBindNavigation, onFocus }: UseShellRouteBridgeOptions) {
  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    onFocus?.();
    const unsubscribe = navigation.addListener('focus', () => {
      onFocus?.();
    });

    return unsubscribe;
  }, [navigation, onFocus]);
}
