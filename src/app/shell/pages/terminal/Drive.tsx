import { View } from 'react-native';

import { AppTheme } from '../../../../core/constants/theme';
import { DriveDetailMode, DrivePanel } from '../../../../modules/drive/state/driveSlice';
import {
  ShellHeaderActionButton,
  ShellHeaderActionRow,
  ShellHeaderBackButton,
  ShellHeaderIconButton,
  ShellHeaderPlaceholder,
  ShellHeaderSearchInput,
  ShellSelectIcon,
  ShellHeaderTitle,
  ShellSearchIcon
} from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';
import { DriveContent } from '../drive/DriveContent';
import { TerminalRouteBridgeProps, TerminalRouteScreenProps } from './types';

interface BuildTerminalDriveHeaderInput {
  theme: AppTheme;
  panel: DrivePanel;
  detailMode: DriveDetailMode;
  detailTitle: string;
  searchQuery: string;
  selectionMode: boolean;
  onBrowserBack: () => void;
  onDriveBack: () => void;
  onOpenSearch: () => void;
  onChangeSearch: (value: string) => void;
  onToggleSelect: () => void;
}

export function buildTerminalDriveHeader({
  theme,
  panel,
  detailMode,
  detailTitle,
  searchQuery,
  selectionMode,
  onBrowserBack,
  onDriveBack,
  onOpenSearch,
  onChangeSearch,
  onToggleSelect
}: BuildTerminalDriveHeaderInput): ShellHeaderDescriptor {
  if (detailMode !== 'none') {
    return {
      left: <ShellHeaderBackButton theme={theme} testID="terminal-drive-back-btn" onPress={onDriveBack} />,
      center: (
        <ShellHeaderTitle theme={theme} title={detailTitle || (detailMode === 'preview' ? '文件详情' : '文件操作')} />
      ),
      right: <ShellHeaderPlaceholder testID="terminal-drive-detail-placeholder" />
    };
  }

  if (panel === 'search') {
    return {
      left: <ShellHeaderBackButton theme={theme} testID="terminal-drive-search-back-btn" onPress={onDriveBack} />,
      center: (
        <ShellHeaderSearchInput
          theme={theme}
          value={searchQuery}
          onChangeText={onChangeSearch}
          placeholder="搜索文件 / 目录"
          testID="terminal-drive-top-search-input"
        />
      ),
      right: <ShellHeaderPlaceholder testID="terminal-drive-search-placeholder" />
    };
  }

  if (panel === 'tasks' || panel === 'trash') {
    return {
      left: <ShellHeaderBackButton theme={theme} testID="terminal-drive-panel-back-btn" onPress={onDriveBack} />,
      center: <ShellHeaderTitle theme={theme} title={panel === 'tasks' ? '传输任务' : '垃圾桶'} />,
      right: <ShellHeaderPlaceholder testID="terminal-drive-panel-placeholder" />
    };
  }

  return {
    left: <ShellHeaderBackButton theme={theme} testID="terminal-drive-back-btn" onPress={onBrowserBack} />,
    center: <ShellHeaderTitle theme={theme} title="网盘" />,
    right: (
      <ShellHeaderActionRow testID="shell-drive-top-actions">
        <ShellHeaderIconButton theme={theme} testID="shell-drive-search-btn" onPress={onOpenSearch}>
          <ShellSearchIcon theme={theme} />
        </ShellHeaderIconButton>
        {selectionMode ? (
          <ShellHeaderActionButton
            theme={theme}
            label="完成"
            testID="shell-drive-select-btn"
            onPress={onToggleSelect}
          />
        ) : (
          <ShellHeaderIconButton theme={theme} testID="shell-drive-select-btn" onPress={onToggleSelect}>
            <ShellSelectIcon theme={theme} />
          </ShellHeaderIconButton>
        )}
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
