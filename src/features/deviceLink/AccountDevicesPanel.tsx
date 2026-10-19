import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import type { AccountDevice } from '../../core/api/contracts/deviceLink.ts';
import { renameAccountDevice, revokeAccountDevice } from '../../core/api/services/deviceLinkApi.ts';
import { readActiveDesktopId, subscribeActiveDesktop } from '../../core/auth/activeDesktop.ts';
import { useAccountAuth } from '../../core/auth/useAccountAuth.ts';
import { useT } from '../../shared/i18n';
import { cn } from '../../shared/visual/className.ts';
import {
  activateAccountDesktopSource,
  refreshAccountDesktopDirectory
} from '../chatPersistence/accountDesktopSource.ts';

const ROW_CLASS = 'border-t border-app-line px-app-lg py-app-md first:border-t-0';
const ROW_TOP_CLASS = 'flex-row items-center justify-between gap-app-md';
const NAME_CLASS = 'flex-1 text-app-body-sm font-bold text-app-primary';
const META_CLASS = 'mt-app-xs text-app-caption text-app-tertiary';
const ACTION_CLASS = 'rounded-app-sm bg-app-action px-app-md py-app-sm active:opacity-80';
const ACTION_DISABLED_CLASS = 'bg-app-surface-muted opacity-60';
const ACTION_TEXT_CLASS = 'text-app-caption font-bold text-app-on-action';
const ACTION_DISABLED_TEXT_CLASS = 'text-app-tertiary';
const MESSAGE_CLASS = 'px-app-lg py-app-md text-app-body-sm text-app-secondary';
const ROW_ACTIONS_CLASS = 'mt-app-sm flex-row justify-end gap-app-md';
const LINK_ACTION_CLASS = 'px-app-xs py-app-xs text-app-caption font-bold text-app-brand';
const DANGER_ACTION_CLASS = 'px-app-xs py-app-xs text-app-caption font-bold text-app-danger';

export function AccountDevicesPanel() {
  const t = useT();
  const auth = useAccountAuth();
  const accountId = auth.session?.accountId || '';
  const [deviceList, setDeviceList] = useState<{ accountId: string; items: AccountDevice[] }>({
    accountId: '',
    items: []
  });
  const devices = deviceList.accountId === accountId ? deviceList.items : [];
  const readDesktopId = () => readActiveDesktopId(accountId);
  const activeDesktopId = useSyncExternalStore(subscribeActiveDesktop, readDesktopId, readDesktopId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [switchingId, setSwitchingId] = useState('');
  const [mutatingId, setMutatingId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!accountId) return;
      setLoading(true);
      setError('');
      try {
        const result = await refreshAccountDesktopDirectory(signal);
        if (signal?.aborted) return;
        setDeviceList({ accountId, items: result.items });
      } catch (requestError) {
        if (!signal?.aborted) setError(String((requestError as Error)?.message || t('devices.error.load')));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [accountId, t]
  );

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [refresh]);

  async function selectDesktop(device: AccountDevice) {
    if (!accountId || switchingId) return;
    setSwitchingId(device.deviceId);
    setError('');
    try {
      await activateAccountDesktopSource(accountId, device);
    } catch (selectionError) {
      setError(String((selectionError as Error)?.message || t('devices.error.switch')));
    } finally {
      setSwitchingId('');
    }
  }

  function confirmRevoke(device: AccountDevice) {
    Alert.alert(t('devices.revokeTitle'), t('devices.revokeBody', { name: device.deviceName }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('devices.revoke'),
        style: 'destructive',
        onPress: () => {
          setMutatingId(device.deviceId);
          revokeAccountDevice(device.deviceId)
            .then(() => refresh())
            .catch((mutationError) => setError(String((mutationError as Error)?.message || t('devices.error.update'))))
            .finally(() => setMutatingId(''));
        }
      }
    ]);
  }

  async function saveDeviceName(device: AccountDevice) {
    const name = nameDraft.trim();
    if (!name || [...name].length > 64) {
      setError(t('me.deviceName.error.required'));
      return;
    }
    setMutatingId(device.deviceId);
    try {
      await renameAccountDevice(device.deviceId, name);
      setEditingId('');
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('devices.error.update'));
    } finally {
      setMutatingId('');
    }
  }

  if (!auth.session) return null;
  if (loading && devices.length === 0) {
    return (
      <View className="items-center py-app-lg">
        <ActivityIndicator size="small" />
      </View>
    );
  }
  return (
    <View>
      {devices.map((device) => {
        const selected = device.deviceId === activeDesktopId;
        const canSelect = !selected && !switchingId;
        return (
          <View key={device.deviceId} className={ROW_CLASS}>
            <View className={ROW_TOP_CLASS}>
              <Text className={NAME_CLASS} numberOfLines={1}>
                {device.deviceName}
              </Text>
              <Pressable
                disabled={!canSelect}
                onPress={() => selectDesktop(device).catch(() => {})}
                className={cn(ACTION_CLASS, !canSelect && ACTION_DISABLED_CLASS)}
              >
                <Text className={cn(ACTION_TEXT_CLASS, !canSelect && ACTION_DISABLED_TEXT_CLASS)}>
                  {selected ? t('devices.active') : device.online ? t('devices.connect') : t('devices.offline')}
                </Text>
              </Pressable>
            </View>
            <Text className={META_CLASS} selectable>
              {device.deviceId}
            </Text>
            <Text className={META_CLASS}>
              {t(
                device.online === undefined
                  ? 'devices.unknown'
                  : device.online
                    ? 'me.connection.connected'
                    : 'devices.offline'
              )}
            </Text>
            {editingId === device.deviceId ? (
              <View className="mt-app-sm gap-app-sm">
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  maxLength={64}
                  className="min-h-11 rounded-app-sm border border-app-line bg-app-background px-app-md text-app-body text-app-primary"
                />
                <View className={ROW_ACTIONS_CLASS}>
                  <Pressable onPress={() => setEditingId('')}>
                    <Text className={LINK_ACTION_CLASS}>{t('common.cancel')}</Text>
                  </Pressable>
                  <Pressable disabled={Boolean(mutatingId)} onPress={() => void saveDeviceName(device)}>
                    <Text className={LINK_ACTION_CLASS}>{t('me.deviceName.save')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setEditingId(device.deviceId);
                  setNameDraft(device.deviceName);
                }}
              >
                <Text className={LINK_ACTION_CLASS}>{t('me.row.deviceName')}</Text>
              </Pressable>
            )}
            <View className={ROW_ACTIONS_CLASS}>
              <Pressable disabled={mutatingId === device.deviceId} onPress={() => confirmRevoke(device)}>
                <Text className={DANGER_ACTION_CLASS}>{t('devices.revoke')}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {devices.length === 0 && !error ? <Text className={MESSAGE_CLASS}>{t('devices.empty')}</Text> : null}
      {error ? (
        <Pressable onPress={() => refresh().catch(() => {})}>
          <Text className={MESSAGE_CLASS}>
            {error} · {t('common.retry')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
