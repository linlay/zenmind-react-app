import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect } from 'react';
import { BackHandler, View } from 'react-native';

import type { RootStackParamList } from '../../app/navigation/types';
import { useWebAppsRuntime } from './WebAppsRuntimeProvider';

type WebAppDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'WebAppDetail'>;

export function WebAppDetailScreen({ navigation, route }: WebAppDetailScreenProps) {
  const { activeApp, detailVisible, selectorVisible, enterDetail, leaveDetail, closeSelector } = useWebAppsRuntime();
  const handleClose = useCallback(() => navigation.goBack(), [navigation]);

  useEffect(() => {
    enterDetail(route.params.initialAppId, handleClose);
    return leaveDetail;
  }, [enterDetail, handleClose, leaveDetail, route.params.initialAppId]);

  useEffect(() => {
    if (detailVisible && !activeApp) {
      navigation.goBack();
    }
  }, [activeApp, detailVisible, navigation]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!selectorVisible) {
        return false;
      }
      closeSelector();
      return true;
    });
    return () => subscription.remove();
  }, [closeSelector, selectorVisible]);

  return <View className="flex-1 bg-app-surface" />;
}
