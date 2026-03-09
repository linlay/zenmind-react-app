import { useMemo } from 'react';
import { View } from 'react-native';

import { AppTheme } from '../../../../core/constants/theme';
import {
  ShellHeaderActionRow,
  ShellHeaderBackButton,
  ShellHeaderIconButton,
  ShellSelectIcon,
  ShellHeaderTitle,
  ShellSearchIcon
} from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';
import { DriveContent } from '../drive/DriveContent';
import { TerminalRouteBridgeProps, TerminalRouteScreenProps } from './types';

export function buildTerminalDriveHeader(
  theme: AppTheme,
  onBack: () => void,
  onSearch: () => void,
  onSelect: () => void
): ShellHeaderDescriptor {
  return {
    left: <ShellHeaderBackButton theme={theme} testID="terminal-drive-back-btn" onPress={onBack} />,
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

export function TerminalDriveRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus
}: TerminalRouteScreenProps<'TerminalDrive'> & TerminalRouteBridgeProps) {
  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('TerminalDrive')
  });

  return (
    <View style={{ flex: 1 }}>
      <DriveContent testIDPrefix="terminal-drive" />
    </View>
  );
}
