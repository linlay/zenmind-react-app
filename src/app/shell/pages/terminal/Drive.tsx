import { View } from 'react-native';

import { AppTheme } from '../../../../core/constants/theme';
import { DriveDetailMode, DrivePanel } from '../../../../modules/drive/state/driveSlice';
import { DriveRouteName } from '../drive/types';
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
import { DriveScreen } from '../drive/Navigator';
import { TerminalRouteBridgeProps, TerminalRouteScreenProps } from './types';

interface BuildTerminalDriveHeaderInput {
  theme: AppTheme;
  routeName: DriveRouteName;
  pickerPath?: string;
  pickerMountName?: string;
  panel: DrivePanel;
  detailMode: DriveDetailMode;
  detailTitle: string;
  browserPath: string;
  searchQuery: string;
  selectionMode: boolean;
  onBrowserBack: () => void;
  onDriveBack: () => void;
  onOpenSearch: () => void;
  onChangeSearch: (value: string) => void;
  onToggleSelect: () => void;
  onCancelPicker: () => void;
}

function resolveTerminalDriveBrowserTitle(path: string) {
  const normalized = String(path || '').trim();
  if (!normalized || normalized === '/') {
    return '网盘';
  }
  return normalized.split('/').filter(Boolean).at(-1) || '网盘';
}

function resolveTerminalDrivePickerTitle(path: string, mountName?: string) {
  const normalized = String(path || '').trim();
  if (!normalized || normalized === '/') {
    return String(mountName || '').trim() || '网盘';
  }
  return normalized.split('/').filter(Boolean).at(-1) || String(mountName || '').trim() || '网盘';
}

export function buildTerminalDriveHeader({
  theme,
  routeName,
  pickerPath,
  pickerMountName,
  panel,
  detailMode,
  detailTitle,
  browserPath,
  searchQuery,
  selectionMode,
  onBrowserBack,
  onDriveBack,
  onOpenSearch,
  onChangeSearch,
  onToggleSelect,
  onCancelPicker
}: BuildTerminalDriveHeaderInput): ShellHeaderDescriptor {
  if (routeName === 'DriveMoveCopyPicker') {
    const isRootPicker = !pickerPath || pickerPath === '/';

    return {
      left: isRootPicker ? (
        <ShellHeaderPlaceholder testID="terminal-drive-picker-placeholder" />
      ) : (
        <ShellHeaderBackButton theme={theme} testID="terminal-drive-picker-back-btn" onPress={onDriveBack} />
      ),
      center: (
        <ShellHeaderTitle theme={theme} title={resolveTerminalDrivePickerTitle(pickerPath || '/', pickerMountName)} />
      ),
      right: (
        <ShellHeaderActionButton
          theme={theme}
          label="取消"
          testID="terminal-drive-picker-cancel-btn"
          onPress={onCancelPicker}
        />
      )
    };
  }

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
    center: <ShellHeaderTitle theme={theme} title={resolveTerminalDriveBrowserTitle(browserPath)} />,
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
  onBindDriveNavigation,
  onDriveRouteFocus,
  onRouteFocus
}: TerminalRouteScreenProps<'TerminalDrive'> & TerminalRouteBridgeProps) {
  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('TerminalDrive')
  });

  return (
    <View style={{ flex: 1 }}>
      <DriveScreen onBindNavigation={onBindDriveNavigation} onRouteFocus={onDriveRouteFocus} testIDPrefix="terminal-drive" />
    </View>
  );
}
