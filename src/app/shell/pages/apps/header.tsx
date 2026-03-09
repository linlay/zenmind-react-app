import { AppTheme } from '../../../../core/constants/theme';
import { ShellHeaderActionButton, ShellHeaderBackButton, ShellHeaderPlaceholder, ShellHeaderTitle } from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';

export function buildAppsListHeader(theme: AppTheme, onCreate: () => void): ShellHeaderDescriptor {
  return {
    left: <ShellHeaderPlaceholder />,
    center: <ShellHeaderTitle theme={theme} title="小应用" />,
    right: <ShellHeaderActionButton theme={theme} label="新增" testID="shell-apps-create-btn" onPress={onCreate} />
  };
}

export function buildAppsWebViewHeader(theme: AppTheme, title: string, onBack: () => void): ShellHeaderDescriptor {
  return {
    left: <ShellHeaderBackButton theme={theme} testID="apps-detail-back-btn" onPress={onBack} />,
    center: <ShellHeaderTitle theme={theme} title={title || '小应用'} />,
    right: <ShellHeaderPlaceholder testID="apps-detail-right-placeholder" />
  };
}
