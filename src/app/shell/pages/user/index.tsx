import { useNavigation } from '@react-navigation/native';
import { ShellUserTabScreenProps } from './types';
import { ShellTabNavigation } from '../../types';
import { useEffect } from 'react';
import { UserSettingsScreen } from '../../../../modules/user/screens/UserSettingsScreen';

export function ShellUserTabScreen({
  onBindRootTabNavigation,
  onDomainFocus,
  theme,
  onSettingsApplied,
  username,
  deviceName,
  accessToken,
  versionLabel,
  onLogout
}: ShellUserTabScreenProps) {
  const navigation = useNavigation<ShellTabNavigation>();

  useEffect(() => {
    onBindRootTabNavigation(navigation);
  }, [navigation, onBindRootTabNavigation]);

  useEffect(() => {
    const notifyFocus = () => onDomainFocus?.('user');

    if (navigation.isFocused()) {
      notifyFocus();
    }

    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onDomainFocus]);

  return (
    <UserSettingsScreen
      theme={theme}
      onSettingsApplied={onSettingsApplied}
      username={username}
      deviceName={deviceName}
      accessToken={accessToken}
      versionLabel={versionLabel}
      onLogout={onLogout}
    />
  );
}
