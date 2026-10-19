import { useCloudAuth } from '../../../core/auth/useCloudAuth';
import { getSelectedSource, subscribeActiveDesktop } from '../../../core/auth/activeDesktop';
import { verifyDefaultCloud } from '../cloudAccess';
import { useMemo, useRef, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AccountDevice } from '../../../core/api/contracts/deviceLink';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';

type Props = {
  visible: boolean;
  loggedIn: boolean;
  devices: AccountDevice[];
  selectedId: string;
  loading: boolean;
  switchingId: string | null;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (device: AccountDevice | null) => void;
  onLogin: (mode: 'account' | 'cloud') => void;
};

export function AccountSourceSheet(props: Props) {
  const t = useT();
  const cloud = useCloudAuth();
  const selected = useSyncExternalStore(subscribeActiveDesktop, getSelectedSource, getSelectedSource);
  const switching = props.switchingId !== null;
  const cloudDisabled = switching || cloud.status !== 'available';
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  const drag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 60 || (gesture.dy > 15 && gesture.vy > 0.7)) closeRef.current();
        }
      }),
    []
  );
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View className="flex-1 justify-end bg-app-overlay">
        <Pressable className="absolute inset-0" onPress={props.onClose} accessibilityLabel={t('common.cancel')} />
        <View
          accessibilityViewIsModal
          className="rounded-t-app-xl bg-app-surface"
          style={{ paddingBottom: insets.bottom, maxHeight: height * 0.75 }}
        >
          <View className="h-7 items-center justify-center" {...drag.panHandlers}>
            <View className="h-1 w-10 rounded-app-pill bg-app-line" />
          </View>
          <View className="min-h-12 flex-row items-center justify-between px-app-xl">
            <Text className="text-app-title-sm font-bold text-app-primary">{t('accountSource.title')}</Text>
            {props.loggedIn ? (
              <Pressable
                disabled={props.loading || switching}
                onPress={props.onRefresh}
                accessibilityRole="button"
                accessibilityLabel={t('accountSource.refresh')}
                className="h-11 w-11 items-center justify-center"
              >
                {props.loading ? <ActivityIndicator /> : <AppIcon usage="accountSource.refresh" />}
              </Pressable>
            ) : null}
          </View>
          {props.error ? (
            <Text className="px-app-xl pb-app-sm text-app-body-sm text-app-danger">{props.error}</Text>
          ) : null}
          <ScrollView>
            <Pressable
              disabled={cloudDisabled}
              accessibilityRole="button"
              accessibilityState={{
                selected: selected?.kind === 'cloud',
                disabled: cloudDisabled,
                busy: props.switchingId === ''
              }}
              onPress={() => props.onSelect(null)}
              className="min-h-16 flex-row items-center gap-app-md px-app-xl"
            >
              <AppIcon usage="accountSource.cloud" />
              <Text
                className={
                  cloudDisabled ? 'flex-1 text-app-body text-app-tertiary' : 'flex-1 text-app-body text-app-primary'
                }
              >
                {t('accountSource.cloud')}
              </Text>
              {props.switchingId === '' ? (
                <ActivityIndicator />
              ) : selected?.kind === 'cloud' ? (
                <AppIcon usage="accountSource.selected" />
              ) : null}
            </Pressable>
            <View className="gap-app-sm px-app-xl pb-app-md">
              <Text className="text-app-footnote text-app-secondary">{t(`cloud.status.${cloud.status}`)}</Text>
              <View className="flex-row gap-app-lg">
                <Pressable
                  onPress={() => props.onLogin('cloud')}
                  accessibilityRole="button"
                  className="min-h-11 justify-center"
                >
                  <Text className="font-bold text-app-action">{t('cloud.login')}</Text>
                </Pressable>
                <Pressable
                  disabled={cloud.status === 'checking' || switching}
                  onPress={() => void verifyDefaultCloud()}
                  accessibilityRole="button"
                  className="min-h-11 justify-center"
                >
                  <Text className="font-bold text-app-action">{t('common.retry')}</Text>
                </Pressable>
              </View>
            </View>
            {!props.loggedIn ? (
              <Pressable
                onPress={() => props.onLogin('account')}
                accessibilityRole="button"
                className="min-h-14 justify-center border-t border-app-line px-app-xl"
              >
                <Text className="font-bold text-app-action">{t('auth.mode.account')}</Text>
              </Pressable>
            ) : null}
            {props.loggedIn
              ? props.devices.map((device) => (
                  <Pressable
                    key={device.deviceId}
                    disabled={switching}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: props.selectedId === device.deviceId,
                      disabled: switching,
                      busy: props.switchingId === device.deviceId
                    }}
                    onPress={() => props.onSelect(device)}
                    className="min-h-16 flex-row items-center gap-app-md border-t border-app-line px-app-xl py-app-sm"
                  >
                    <AppIcon usage="accountSource.desktop" />
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-app-body text-app-primary">
                        {device.deviceName}
                      </Text>
                      <Text className="mt-app-xs text-app-caption text-app-secondary">
                        {t(
                          device.online === undefined
                            ? 'devices.unknown'
                            : device.online
                              ? 'devices.online'
                              : 'devices.offline'
                        )}
                      </Text>
                    </View>
                    {props.switchingId === device.deviceId ? (
                      <ActivityIndicator />
                    ) : props.selectedId === device.deviceId ? (
                      <AppIcon usage="accountSource.selected" />
                    ) : null}
                  </Pressable>
                ))
              : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
