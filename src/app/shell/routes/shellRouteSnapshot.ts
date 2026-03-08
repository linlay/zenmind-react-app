import { DomainMode } from '../../../core/types/common';
import { AppsRouteName } from '../pages/apps/types';
import { ChatRouteName } from '../pages/chat/types';
import { TerminalRouteName } from '../pages/terminal/types';

export type ShellChatMode = 'list' | 'search';
export type ShellChatOverlayType = '' | 'agentDetail' | 'chatDetail';
export type ShellTerminalPane = 'list' | 'detail' | 'drive';
export type ShellAppsPane = 'list' | 'detail';

export interface ShellRouteSnapshot {
  activeDomain: DomainMode;
  appsRouteName: AppsRouteName;
  chatRouteName: ChatRouteName;
  terminalRouteName: TerminalRouteName;
  appsPane: ShellAppsPane;
  agentsPane: 'list' | 'publish';
  chatMode: ShellChatMode;
  chatOverlayType: ShellChatOverlayType;
  hasChatOverlay: boolean;
  terminalPane: ShellTerminalPane;
}

interface BuildShellRouteSnapshotInput {
  activeDomain: DomainMode | 'agents';
  appsRouteName?: AppsRouteName;
  agentsRouteName?: string;
  chatRouteName: ChatRouteName;
  terminalRouteName: TerminalRouteName;
}

function toChatMode(routeName: ChatRouteName): ShellChatMode {
  return routeName === 'ChatSearch' ? 'search' : 'list';
}

function toChatOverlayType(routeName: ChatRouteName): ShellChatOverlayType {
  if (routeName === 'AgentProfile') {
    return 'agentDetail';
  }
  if (routeName === 'ChatDetail') {
    return 'chatDetail';
  }
  return '';
}

function toTerminalPane(routeName: TerminalRouteName): ShellTerminalPane {
  if (routeName === 'TerminalDetail') {
    return 'detail';
  }
  if (routeName === 'TerminalDrive') {
    return 'drive';
  }
  return 'list';
}

function toAppsPane(routeName: AppsRouteName): ShellAppsPane {
  return routeName === 'AppsWebView' ? 'detail' : 'list';
}

export function buildShellRouteSnapshot({
  activeDomain,
  appsRouteName,
  agentsRouteName,
  chatRouteName,
  terminalRouteName
}: BuildShellRouteSnapshotInput): ShellRouteSnapshot {
  const chatOverlayType = toChatOverlayType(chatRouteName);
  const normalizedActiveDomain = activeDomain === 'agents' ? 'apps' : activeDomain;
  const normalizedAppsRouteName = appsRouteName || 'AppsList';
  const legacyAgentsPane = agentsRouteName === 'AgentsPublish' ? 'publish' : 'list';

  return {
    activeDomain: normalizedActiveDomain,
    appsRouteName: normalizedAppsRouteName,
    chatRouteName,
    terminalRouteName,
    appsPane: toAppsPane(normalizedAppsRouteName),
    agentsPane: legacyAgentsPane,
    chatMode: toChatMode(chatRouteName),
    chatOverlayType,
    hasChatOverlay: Boolean(chatOverlayType),
    terminalPane: toTerminalPane(terminalRouteName)
  };
}
