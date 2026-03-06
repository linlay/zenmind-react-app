import { DomainMode } from '../../../core/types/common';
import { ShellRouteSnapshot } from './shellRouteSnapshot';

const DOMAIN_LABEL: Record<DomainMode, string> = {
  chat: '对话',
  terminal: '终端',
  agents: '智能体',
  user: '配置'
};

interface BuildShellRouteModelInput {
  routeSnapshot: ShellRouteSnapshot;
  activeAgentName: string;
  activeAgentRole: string;
}

export interface ShellRouteModel {
  isChatDomain: boolean;
  isTerminalDomain: boolean;
  isAgentsDomain: boolean;
  isUserDomain: boolean;
  isAgentsPublishPage: boolean;
  isChatDetailOverlay: boolean;
  isChatAgentOverlay: boolean;
  isChatListTopNav: boolean;
  showBottomNav: boolean;
  topNavTitle: string;
  topNavSubtitle: string;
}

export function buildShellRouteModel({
  routeSnapshot,
  activeAgentName,
  activeAgentRole
}: BuildShellRouteModelInput): ShellRouteModel {
  const { activeDomain, agentsPane, chatMode, chatOverlayType, hasChatOverlay, terminalPane } = routeSnapshot;
  const isChatDomain = activeDomain === 'chat';
  const isTerminalDomain = activeDomain === 'terminal';
  const isAgentsDomain = activeDomain === 'agents';
  const isUserDomain = activeDomain === 'user';
  const isAgentsPublishPage = isAgentsDomain && agentsPane === 'publish';

  const isChatDetailOverlay = chatOverlayType === 'chatDetail';
  const isChatAgentOverlay = chatOverlayType === 'agentDetail';
  const isChatListTopNav = isChatDomain && !hasChatOverlay && chatMode === 'list';

  const topNavTitle = isChatDomain
    ? isChatDetailOverlay
      ? activeAgentName
      : isChatAgentOverlay
      ? activeAgentName
      : chatMode === 'search'
      ? '搜索'
      : '对话'
    : isTerminalDomain
    ? terminalPane === 'detail'
      ? '终端/CLI'
      : terminalPane === 'drive'
      ? '网盘'
      : '会话'
    : isAgentsDomain
    ? agentsPane === 'publish'
      ? '发布中心'
      : DOMAIN_LABEL[activeDomain]
    : DOMAIN_LABEL[activeDomain];

  const showBottomNav =
    !(
      (isChatDomain && hasChatOverlay) ||
      (isTerminalDomain && terminalPane !== 'list') ||
      (isAgentsDomain && agentsPane === 'publish')
    ) && chatMode !== 'search';

  return {
    isChatDomain,
    isTerminalDomain,
    isAgentsDomain,
    isUserDomain,
    isAgentsPublishPage,
    isChatDetailOverlay,
    isChatAgentOverlay,
    isChatListTopNav,
    showBottomNav,
    topNavTitle,
    topNavSubtitle: isChatDomain && isChatDetailOverlay ? activeAgentRole : ''
  };
}
