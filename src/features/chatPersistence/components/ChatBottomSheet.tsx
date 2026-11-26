import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  type StyleProp,
  type ViewStyle,
  View
} from 'react-native';

type Props = {
  visible: boolean;
  closeLabel: string;
  onClose: () => void;
  onDismiss?: () => void;
  panelClassName: string;
  panelStyle?: StyleProp<ViewStyle>;
  avoidKeyboard?: boolean;
  presentation?: 'modal' | 'contained';
  children: ReactNode;
};

export function ChatBottomSheet({
  visible,
  closeLabel,
  onClose,
  onDismiss,
  panelClassName,
  panelStyle,
  avoidKeyboard = false,
  presentation = 'modal',
  children
}: Props) {
  const contained = presentation === 'contained';
  const progress = useRef(new Animated.Value(0)).current;
  const [presented, setPresented] = useState(visible);
  const [ready, setReady] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const retainedContent = useRef(children);
  const visibleRef = useRef(visible);
  const onDismissRef = useRef(onDismiss);
  const dismissPending = useRef(false);

  useLayoutEffect(() => {
    visibleRef.current = visible;
    onDismissRef.current = onDismiss;
    // Keep the last open content intact until the exit finishes.
    if (visible) retainedContent.current = children;
  }, [children, onDismiss, visible]);

  const notifyDismissed = useCallback(() => {
    if (!dismissPending.current) return;
    dismissPending.current = false;
    if (!visibleRef.current) onDismissRef.current?.();
  }, []);

  useEffect(() => {
    if (visible && !presented) {
      progress.setValue(0);
      if (!contained) {
        setReady(false);
        setSheetHeight(0);
      }
      setPresented(true);
    }
  }, [contained, presented, progress, visible]);

  useEffect(() => {
    if (!presented || (visible && ((!contained && !ready) || sheetHeight === 0))) return;

    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true
    });
    animation.start(({ finished }) => {
      if (finished && !visible) {
        dismissPending.current = true;
        setPresented(false);
      }
    });
    // A rapid reopen reverses from the current position instead of unmounting.
    return () => animation.stop();
  }, [contained, presented, progress, ready, sheetHeight, visible]);

  useEffect(() => {
    // iOS must finish dismissing its native controller before opening a picker.
    if (!presented && (contained || Platform.OS !== 'ios')) notifyDismissed();
  }, [contained, notifyDismissed, presented]);

  useEffect(() => {
    if (!contained || !visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [contained, onClose, visible]);

  const sheet = (
    <>
      <Animated.View pointerEvents="none" className="absolute inset-0 bg-app-overlay" style={{ opacity: progress }} />
      <Pressable
        accessible={!contained}
        disabled={contained && !visible}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        className="absolute inset-0"
        onPress={onClose}
      />
      <KeyboardAvoidingView
        pointerEvents="box-none"
        enabled={avoidKeyboard && (!contained || visible)}
        behavior="padding"
        className="flex-1 justify-end"
      >
        <Animated.View
          accessibilityViewIsModal={visible}
          pointerEvents={visible ? 'auto' : 'none'}
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
          className={panelClassName}
          style={[
            panelStyle,
            {
              opacity: sheetHeight > 0 ? 1 : 0,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }]
            }
          ]}
        >
          {contained || visible ? children : retainedContent.current}
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );

  if (contained) {
    return (
      <View
        className="absolute inset-0 overflow-hidden"
        style={{ opacity: presented ? 1 : 0 }}
        pointerEvents={visible && presented ? 'auto' : 'none'}
        accessibilityViewIsModal={visible}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      >
        {sheet}
      </View>
    );
  }

  return (
    <Modal
      transparent
      visible={presented}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => setReady(true)}
      onDismiss={notifyDismissed}
      onRequestClose={onClose}
    >
      <View className="flex-1">{sheet}</View>
    </Modal>
  );
}
