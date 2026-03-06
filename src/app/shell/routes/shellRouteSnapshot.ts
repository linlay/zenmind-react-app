import { DomainMode } from '../../../core/types/common';
import { AgentsRouteName } from '../pages/agents/types';
import { ChatRouteName } from '../pages/chat/types';
import { TerminalRouteName } from '../pages/terminal/types';

export type ShellChatMode = 'list' | 'search';
export type ShellChatOverlayType = '' | 'agentDetail' | 'chatDetail';
export type ShellTerminalPane = 'list' | 'detail' | 'drive';
export type ShellAgentsPane = 'list' | 'publish';

export interface ShellRouteSnapshot {
  activeDomain: DomainMode;
  agentsRouteName: AgentsRouteName;
  chatRouteName: ChatRouteName;
  terminalRouteName: TerminalRouteName;
  agentsPane: ShellAgentsPane;
  chatMode: ShellChatMode;
  chatOverlayType: ShellChatOverlayType;
  hasChatOverlay: boolean;
  terminalPane: ShellTerminalPane;
}

interface BuildShellRouteSnapshotInput {
  activeDomain: DomainMode;
  agentsRouteName: AgentsRouteName;
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

function toAgentsPane(routeName: AgentsRouteName): ShellAgentsPane {
  return routeName === 'AgentsPublish' ? 'publish' : 'list';
}

export function buildShellRouteSnapshot({
  activeDomain,
  agentsRouteName,
  chatRouteName,
  terminalRouteName
}: BuildShellRouteSnapshotInput): ShellRouteSnapshot {
  const chatOverlayType = toChatOverlayType(chatRouteName);

  return {
    activeDomain,
    agentsRouteName,
    chatRouteName,
    terminalRouteName,
    agentsPane: toAgentsPane(agentsRouteName),
    chatMode: toChatMode(chatRouteName),
    chatOverlayType,
    hasChatOverlay: Boolean(chatOverlayType),
    terminalPane: toTerminalPane(terminalRouteName)
  };
}
