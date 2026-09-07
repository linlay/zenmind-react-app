import { forwardRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';

export type AppKeyboardAwareScrollViewProps = ScrollViewProps;

export const AppKeyboardAwareScrollView = forwardRef<ScrollView, AppKeyboardAwareScrollViewProps>(
  function AppKeyboardAwareScrollView(
    {
      automaticallyAdjustKeyboardInsets = Platform.OS === 'ios',
      keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag',
      keyboardShouldPersistTaps = 'handled',
      ...scrollViewProps
    },
    ref
  ) {
    return (
      <ScrollView
        ref={ref}
        {...scrollViewProps}
        automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
        keyboardDismissMode={keyboardDismissMode}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      />
    );
  }
);
