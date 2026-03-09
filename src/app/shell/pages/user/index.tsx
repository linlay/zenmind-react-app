import { useNavigation } from '@react-navigation/native';
import { ShellUserTabScreenProps } from './types';
import { ShellTabNavigation } from '../../types';
import { useEffect } from 'react';
import { AppTheme } from '../../../../core/constants/theme';
import { UserSettingsScreen } from '../../../../modules/user/screens/UserSettingsScreen';
import { ShellHeaderInboxButton, ShellHeaderThemeButton, ShellHeaderTitle } from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';

export function buildUserHeader(
  theme: AppTheme,
  inboxUnreadCount: number,
  onToggleInbox: () => void,
  onToggleTheme: () => void
): ShellHeaderDescriptor {
  return {
    left: (
      <ShellHeaderInboxButton
        theme={theme}
        badgeCount={inboxUnreadCount}
        testID="shell-user-inbox-toggle-btn"
        onPress={onToggleInbox}
      />
    ),
    center: <ShellHeaderTitle theme={theme} title="用户" />,
    right: <ShellHeaderThemeButton theme={theme} testID="shell-theme-toggle-btn" onPress={onToggleTheme} />
  };
}

export function ShellUserTabScreen({
  onBindRootTabNavigation,
  onDomainFocus,
  theme,
  onSettingsApplied,
  username,
  deviceName,
  accessToken,
  versionLabel,
  onClearChatCache,
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
      onClearChatCache={onClearChatCache}
      onLogout={onLogout}
    />
  );
}
