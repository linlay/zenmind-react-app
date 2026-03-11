import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { AppTheme } from '../../../../core/constants/theme';
import { DriveDetailMode, DrivePanel } from '../../../../modules/drive/state/driveSlice';
import { ShellTabBindings, ShellTabNavigation } from '../../types';
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
import { DriveContent } from './DriveContent';

interface BuildDriveHeaderInput {
  theme: AppTheme;
  panel: DrivePanel;
  detailMode: DriveDetailMode;
  detailTitle: string;
  searchQuery: string;
  selectionMode: boolean;
  onBack: () => void;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  onChangeSearch: (value: string) => void;
  onToggleSelect: () => void;
}

export function buildDriveHeader({
  theme,
  panel,
  detailMode,
  detailTitle,
  searchQuery,
  selectionMode,
  onBack,
  onOpenMenu,
  onOpenSearch,
  onChangeSearch,
  onToggleSelect
}: BuildDriveHeaderInput): ShellHeaderDescriptor {
  if (detailMode !== 'none') {
    return {
      left: <ShellHeaderBackButton theme={theme} testID="shell-drive-back-btn" onPress={onBack} />,
      center: <ShellHeaderTitle theme={theme} title={detailTitle || (detailMode === 'preview' ? '文件详情' : '文件操作')} />,
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

  return {
    left: (
      <ShellHeaderIconButton theme={theme} testID="shell-drive-menu-btn" onPress={onOpenMenu}>
        <ShellMenuIcon theme={theme} />
      </ShellHeaderIconButton>
    ),
    center: <ShellHeaderTitle theme={theme} title="网盘" />,
    right: (
      <ShellHeaderActionRow testID="shell-drive-top-actions">
        <ShellHeaderIconButton theme={theme} testID="shell-drive-search-btn" onPress={onOpenSearch}>
          <ShellSearchIcon theme={theme} />
        </ShellHeaderIconButton>
        {selectionMode ? (
          <ShellHeaderActionButton theme={theme} label="完成" testID="shell-drive-select-btn" onPress={onToggleSelect} />
        ) : (
          <ShellHeaderIconButton theme={theme} testID="shell-drive-select-btn" onPress={onToggleSelect}>
            <ShellSelectIcon theme={theme} />
          </ShellHeaderIconButton>
        )}
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
