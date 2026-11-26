import { type ComponentProps } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatBottomSheet } from './ChatBottomSheet';

type Props = Omit<ComponentProps<typeof ChatBottomSheet>, 'avoidKeyboard' | 'panelClassName' | 'panelStyle'>;
const PANEL_CLASS = 'w-full max-w-[560px] self-center overflow-hidden rounded-t-[24px] border border-app-line bg-app-surface';

export function ChatComposerSheet(props: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <ChatBottomSheet
      {...props}
      avoidKeyboard
      panelClassName={props.presentation === 'contained' ? `${PANEL_CLASS} shrink` : PANEL_CLASS}
      panelStyle={{ paddingBottom: Math.max(insets.bottom, 12), maxHeight: height - insets.top - 24 }}
    />
  );
}
