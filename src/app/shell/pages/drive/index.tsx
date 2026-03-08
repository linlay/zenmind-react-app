import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { ShellTabBindings, ShellTabNavigation } from '../../types';
import { DriveContent } from './DriveContent';

export function ShellDriveTabScreen({ onBindRootTabNavigation, onDomainFocus }: ShellTabBindings) {
  const navigation = useNavigation<ShellTabNavigation>();

  useEffect(() => {
    onBindRootTabNavigation(navigation);
  }, [navigation, onBindRootTabNavigation]);

  useEffect(() => {
    const notifyFocus = () => onDomainFocus?.('drive');

    if (navigation.isFocused()) {
      notifyFocus();
    }

    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onDomainFocus]);

  return (
    <View style={styles.page}>
      <DriveContent testIDPrefix="drive" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1
  }
});
