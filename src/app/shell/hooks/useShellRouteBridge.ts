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
    onBindNavigation?.(navigation);
    onFocus?.();
    const unsubscribe = navigation.addListener('focus', () => {
      onBindNavigation?.(navigation);
      onFocus?.();
    });

    return unsubscribe;
  }, [navigation, onBindNavigation, onFocus]);
}
