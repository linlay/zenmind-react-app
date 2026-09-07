import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { ActivityIndicator, Modal, Pressable, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../shared/icons/AppIcon';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';

const SCREEN_CLASS = 'flex-1 bg-black';
const ABSOLUTE_FILL_STYLE = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
} satisfies ViewStyle;
const SAFE_AREA_CLASS = 'flex-1 items-center justify-center';
const GUIDE_WRAP_CLASS = 'relative h-[244px] w-[244px]';
const GUIDE_FRAME_CLASS = 'h-full w-full rounded-app-lg border-2 border-white/90 bg-white/[0.03]';
const STATUS_WRAP_CLASS = 'absolute left-app-xl right-app-xl top-app-xl z-10 items-center';
const STATUS_PILL_CLASS =
  'max-w-[340px] flex-row items-center gap-app-sm rounded-app-pill bg-black/75 px-app-lg py-app-md';
const STATUS_TEXT_CLASS = 'text-app-body-sm font-semibold text-white';
const CLOSE_BUTTON_CLASS =
  'absolute left-1/2 top-full mt-app-xl h-[52px] w-[52px] -translate-x-1/2 items-center justify-center rounded-app-pill bg-black/45 active:bg-black/60';

type FullScreenPairingScannerProps = {
  errorMessage: string;
  isConnecting: boolean;
  isPaused: boolean;
  onBarcodeScanned: (result: BarcodeScanningResult) => void;
  onMountError: (message: string) => void;
  onRequestClose: () => void;
};

export function FullScreenPairingScanner({
  errorMessage,
  isConnecting,
  isPaused,
  onBarcodeScanned,
  onMountError,
  onRequestClose
}: FullScreenPairingScannerProps) {
  const t = useT();
  const { theme } = useAppTheme();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onRequestClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
      visible
    >
      <View className={SCREEN_CLASS}>
        <CameraView
          active={!isPaused}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          facing="back"
          onBarcodeScanned={isPaused ? undefined : onBarcodeScanned}
          onMountError={(event) => onMountError(event.message)}
          style={ABSOLUTE_FILL_STYLE}
        />

        <SafeAreaView edges={['top', 'bottom']} className={SAFE_AREA_CLASS}>
          {errorMessage || isConnecting ? (
            <View accessibilityLiveRegion="polite" pointerEvents="none" className={STATUS_WRAP_CLASS}>
              <View className={STATUS_PILL_CLASS}>
                {isConnecting && !errorMessage ? (
                  <ActivityIndicator size="small" color={theme.colors.onBrandBlueAction} />
                ) : null}
                <Text className={STATUS_TEXT_CLASS}>{errorMessage || t('auth.scan.connecting')}</Text>
              </View>
            </View>
          ) : null}

          <View className={GUIDE_WRAP_CLASS}>
            <View className={GUIDE_FRAME_CLASS} />
            <Pressable
              accessibilityLabel={t('auth.scan.close')}
              accessibilityRole="button"
              onPress={onRequestClose}
              className={CLOSE_BUTTON_CLASS}
            >
              <AppIcon usage="authScanner.close" color={theme.colors.onBrandBlueAction} size={28} />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
