import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { AppTheme } from '../../../../core/constants/theme';
import { ShellTabBindings, ShellTabNavigation } from '../../types';
import {
  ShellHeaderActionRow,
  ShellHeaderIconButton,
  ShellMenuIcon,
  ShellSelectIcon,
  ShellHeaderTitle,
  ShellSearchIcon
} from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';
import { DriveContent } from './DriveContent';

export function buildDriveHeader(
  theme: AppTheme,
  onMenu: () => void,
  onSearch: () => void,
  onSelect: () => void
): ShellHeaderDescriptor {
  return {
    left: (
      <ShellHeaderIconButton theme={theme} testID="shell-drive-menu-btn" onPress={onMenu}>
        <ShellMenuIcon theme={theme} />
      </ShellHeaderIconButton>
    ),
    center: <ShellHeaderTitle theme={theme} title="网盘" />,
    right: (
      <ShellHeaderActionRow testID="shell-drive-top-actions">
        <ShellHeaderIconButton theme={theme} testID="shell-drive-search-btn" onPress={onSearch}>
          <ShellSearchIcon theme={theme} />
        </ShellHeaderIconButton>
        <ShellHeaderIconButton theme={theme} testID="shell-drive-select-btn" onPress={onSelect}>
          <ShellSelectIcon theme={theme} />
        </ShellHeaderIconButton>
      </ShellHeaderActionRow>
    )
  };
}

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
