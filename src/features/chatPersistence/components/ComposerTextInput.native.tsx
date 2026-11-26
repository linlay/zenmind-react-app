import { requireNativeView } from 'expo';
import { forwardRef, type Ref, useState } from 'react';
import { Platform, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import type { ComposerTextEdit } from '../chatComposerDraft';
import type { ComposerTextInputHandle, ComposerTextInputProps } from './ComposerTextInput.types';

// Expo 56 inline modules use the class name on Android and Name(...) on iOS.
const NativeInput = requireNativeView<
  ViewProps & {
    ref?: Ref<ComposerTextInputHandle>;
    value: { text: string; eventCount: number };
    placeholder: string;
    placeholderTextColor: string;
    textColor: string;
    fontSize: number;
    lineHeight: number;
    editable: boolean;
    scrollEnabled: boolean;
    onEdit: (event: NativeSyntheticEvent<ComposerTextEdit>) => void;
    onContentSizeChange: (event: NativeSyntheticEvent<{ height: number }>) => void;
  }
>(Platform.OS === 'android' ? 'ChatComposerInputModule' : 'ChatComposerInput');

export const ComposerTextInput = forwardRef<ComposerTextInputHandle, ComposerTextInputProps>(function ComposerTextInput(
  { value, onEdit, onContentHeight, height, fontScale, ...props },
  ref
) {
  const [eventCount, setEventCount] = useState(0);
  return (
    <NativeInput
      {...props}
      ref={ref}
      accessibilityLabel={props.placeholder}
      value={{ text: value, eventCount }}
      fontSize={16 * fontScale}
      lineHeight={22 * fontScale}
      style={{ height }}
      onEdit={({ nativeEvent }) => {
        setEventCount(nativeEvent.eventCount);
        onEdit(nativeEvent);
      }}
      onContentSizeChange={({ nativeEvent }) => onContentHeight(nativeEvent.height)}
    />
  );
});
