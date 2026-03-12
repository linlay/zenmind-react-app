import { AppTheme } from '../../../../core/constants/theme';
import { DriveDetailMode, DrivePanel } from '../../../../modules/drive/state/driveSlice';
import { DriveRouteName } from './types';
import {
  ShellHeaderActionButton,
  ShellHeaderActionRow,
  ShellHeaderBackButton,
  ShellHeaderIconButton,
  ShellMenuIcon,
  ShellHeaderPlaceholder,
  ShellHeaderSearchInput,
  ShellSelectIcon,
  ShellHeaderTitle,
  ShellSearchIcon
} from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';
export { ShellDriveTabScreen } from './Navigator';

interface BuildDriveHeaderInput {
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
  onBack: () => void;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  onChangeSearch: (value: string) => void;
  onToggleSelect: () => void;
  onCancelPicker: () => void;
}

function resolveDriveBrowserTitle(path: string) {
  const normalized = String(path || '').trim();
  if (!normalized || normalized === '/') {
    return '网盘';
  }
  return normalized.split('/').filter(Boolean).at(-1) || '网盘';
}

function resolveMoveCopyPickerTitle(path: string, mountName?: string) {
  const normalized = String(path || '').trim();
  if (!normalized || normalized === '/') {
    return String(mountName || '').trim() || '网盘';
  }
  return normalized.split('/').filter(Boolean).at(-1) || String(mountName || '').trim() || '网盘';
}

export function buildDriveHeader({
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
  onBack,
  onOpenMenu,
  onOpenSearch,
  onChangeSearch,
  onToggleSelect,
  onCancelPicker
}: BuildDriveHeaderInput): ShellHeaderDescriptor {
  if (routeName === 'DriveMoveCopyPicker') {
    const isRootPicker = !pickerPath || pickerPath === '/';

    return {
      left: isRootPicker ? (
        <ShellHeaderPlaceholder testID="shell-drive-picker-placeholder" />
      ) : (
        <ShellHeaderBackButton theme={theme} testID="shell-drive-picker-back-btn" onPress={onBack} />
      ),
      center: <ShellHeaderTitle theme={theme} title={resolveMoveCopyPickerTitle(pickerPath || '/', pickerMountName)} />,
      right: (
        <ShellHeaderActionButton
          theme={theme}
          label="取消"
          testID="shell-drive-picker-cancel-btn"
          onPress={onCancelPicker}
        />
      )
    };
  }

  if (detailMode !== 'none') {
    return {
      left: <ShellHeaderBackButton theme={theme} testID="shell-drive-back-btn" onPress={onBack} />,
      center: (
        <ShellHeaderTitle theme={theme} title={detailTitle || (detailMode === 'preview' ? '文件详情' : '文件操作')} />
      ),
      right: <ShellHeaderPlaceholder testID="shell-drive-detail-placeholder" />
    };
  }

  if (panel === 'search') {
    return {
      left: <ShellHeaderBackButton theme={theme} testID="shell-drive-search-back-btn" onPress={onBack} />,
      center: (
        <ShellHeaderSearchInput
          theme={theme}
          value={searchQuery}
          onChangeText={onChangeSearch}
          placeholder="搜索文件 / 目录"
          testID="drive-top-search-input"
        />
      ),
      right: <ShellHeaderPlaceholder testID="shell-drive-search-placeholder" />
    };
  }

  if (panel === 'menu' || panel === 'tasks' || panel === 'trash') {
    return {
      left: <ShellHeaderBackButton theme={theme} testID="shell-drive-panel-back-btn" onPress={onBack} />,
      center: (
        <ShellHeaderTitle
          theme={theme}
          title={panel === 'menu' ? '网盘工具' : panel === 'tasks' ? '传输任务' : '垃圾桶'}
        />
      ),
      right: <ShellHeaderPlaceholder testID="shell-drive-panel-placeholder" />
    };
  }

  const browserAtRoot = !browserPath || browserPath === '/';

  return {
    left: browserAtRoot ? (
      <ShellHeaderIconButton theme={theme} testID="shell-drive-menu-btn" onPress={onOpenMenu}>
        <ShellMenuIcon theme={theme} />
      </ShellHeaderIconButton>
    ) : (
      <ShellHeaderBackButton theme={theme} testID="shell-drive-browser-back-btn" onPress={onBack} />
    ),
    center: <ShellHeaderTitle theme={theme} title={resolveDriveBrowserTitle(browserPath)} />,
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
        {!browserAtRoot ? (
          <ShellHeaderIconButton theme={theme} testID="shell-drive-browser-menu-btn" onPress={onOpenMenu}>
            <ShellMenuIcon theme={theme} />
          </ShellHeaderIconButton>
        ) : null}
      </ShellHeaderActionRow>
    )
  };
}
