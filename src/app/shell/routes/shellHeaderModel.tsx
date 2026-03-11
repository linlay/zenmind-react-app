import { AppTheme } from '../../../core/constants/theme';
import { buildAppsListHeader, buildAppsWebViewHeader } from '../pages/apps/header';
import { buildChatDetailHeader } from '../pages/chat/ChatDetail';
import { buildChatListHeader } from '../pages/chat/ListPane';
import { buildChatSearchHeader } from '../pages/chat/SearchPane';
import { buildAgentProfileHeader } from '../pages/chat/AgentProfile';
import { buildDriveHeader } from '../pages/drive';
import { buildTerminalDetailHeader } from '../pages/terminal/Detail';
import { buildTerminalDriveHeader } from '../pages/terminal/Drive';
import { buildTerminalListHeader } from '../pages/terminal/ListPane';
import { buildUserHeader } from '../pages/user';
import { ShellHeaderDescriptor } from '../header/types';
import { ShellRouteSnapshot } from './shellRouteSnapshot';
import { DriveDetailMode, DrivePanel } from '../../../modules/drive/state/driveSlice';

export interface ShellHeaderActions {
  toggleChatAgentsSidebar: () => void;
  goBackInChat: () => void;
  goBackFromChatSearch: () => void;
  openChatSearch: () => void;
  openChatDetailMenu: () => void;
  toggleChatPlusMenu: () => void;
  selectChatPlusMenuItem: (label: string) => void;
  setChatSearchQuery: (value: string) => void;
  goBackFromAppsDetail: () => void;
  createApp: () => void;
  goBackFromTerminal: () => void;
  openTerminalDrive: () => void;
  reloadTerminalDetail: () => void;
  goBackFromDrive: () => void;
  openDriveMenu: () => void;
  openDriveSearch: () => void;
  setDriveSearchQuery: (value: string) => void;
  toggleDriveSelectionMode: () => void;
  toggleTheme: () => void;
}

export interface BuildShellHeaderModelInput {
  theme: AppTheme;
  routeSnapshot: ShellRouteSnapshot;
  chatSearchQuery: string;
  chatPlusMenuOpen: boolean;
  activeAgentName: string;
  activeAgentRole: string;
  activeAppName: string;
  drivePanel: DrivePanel;
  driveDetailMode: DriveDetailMode;
  driveDetailTitle: string;
  driveSearchQuery: string;
  driveSelectionMode: boolean;
  actions: ShellHeaderActions;
}

export function buildShellHeaderDescriptor({
  theme,
  routeSnapshot,
  chatSearchQuery,
  chatPlusMenuOpen,
  activeAgentName,
  activeAgentRole,
  activeAppName,
  drivePanel,
  driveDetailMode,
  driveDetailTitle,
  driveSearchQuery,
  driveSelectionMode,
  actions
}: BuildShellHeaderModelInput): ShellHeaderDescriptor {
  if (routeSnapshot.activeDomain === 'chat') {
    if (routeSnapshot.chatRouteName === 'ChatSearch') {
      return buildChatSearchHeader({
        theme,
        chatSearchQuery,
        onChangeChatSearchQuery: actions.setChatSearchQuery,
        onBack: actions.goBackFromChatSearch
      });
    }
    if (routeSnapshot.chatRouteName === 'ChatDetail') {
      return buildChatDetailHeader({
        theme,
        activeAgentName,
        activeAgentRole,
        onBack: actions.goBackInChat,
        onOpenMenu: actions.openChatDetailMenu
      });
    }
    if (routeSnapshot.chatRouteName === 'AgentProfile') {
      return buildAgentProfileHeader({
        theme,
        title: activeAgentName,
        onBack: actions.goBackInChat
      });
    }
    return buildChatListHeader({
      theme,
      chatPlusMenuOpen,
      onPressLeftAction: actions.toggleChatAgentsSidebar,
      onPressSearch: actions.openChatSearch,
      onTogglePlusMenu: actions.toggleChatPlusMenu,
      onPressPlusMenuItem: actions.selectChatPlusMenuItem
    });
  }

  if (routeSnapshot.activeDomain === 'apps') {
    if (routeSnapshot.appsRouteName === 'AppsWebView') {
      return buildAppsWebViewHeader(theme, activeAppName, actions.goBackFromAppsDetail);
    }
    return buildAppsListHeader(theme, actions.createApp);
  }

  if (routeSnapshot.activeDomain === 'terminal') {
    if (routeSnapshot.terminalRouteName === 'TerminalDetail') {
      return buildTerminalDetailHeader(theme, actions.goBackFromTerminal, actions.reloadTerminalDetail);
    }
    if (routeSnapshot.terminalRouteName === 'TerminalDrive') {
      return buildTerminalDriveHeader({
        theme,
        panel: drivePanel,
        detailMode: driveDetailMode,
        detailTitle: driveDetailTitle,
        searchQuery: driveSearchQuery,
        selectionMode: driveSelectionMode,
        onBrowserBack: actions.goBackFromTerminal,
        onDriveBack: actions.goBackFromDrive,
        onOpenSearch: actions.openDriveSearch,
        onChangeSearch: actions.setDriveSearchQuery,
        onToggleSelect: actions.toggleDriveSelectionMode
      });
    }
    return buildTerminalListHeader(theme, actions.openTerminalDrive);
  }

  if (routeSnapshot.activeDomain === 'drive') {
    return buildDriveHeader({
      theme,
      panel: drivePanel,
      detailMode: driveDetailMode,
      detailTitle: driveDetailTitle,
      searchQuery: driveSearchQuery,
      selectionMode: driveSelectionMode,
      onBack: actions.goBackFromDrive,
      onOpenMenu: actions.openDriveMenu,
      onOpenSearch: actions.openDriveSearch,
      onChangeSearch: actions.setDriveSearchQuery,
      onToggleSelect: actions.toggleDriveSelectionMode
    });
  }

  if (routeSnapshot.activeDomain === 'user') {
    return buildUserHeader(theme, actions.toggleTheme);
  }

  return {};
}
