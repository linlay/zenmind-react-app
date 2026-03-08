import { DomainMode } from '../../../core/types/common';
import { ShellRouteSnapshot } from './shellRouteSnapshot';

const DOMAIN_LABEL: Record<DomainMode, string> = {
  chat: '对话',
  apps: '小应用',
  terminal: '终端',
  drive: '网盘',
  user: '用户'
};

interface BuildShellRouteModelInput {
  routeSnapshot: ShellRouteSnapshot;
  activeAgentName: string;
  activeAgentRole: string;
  activeAppName?: string;
}

export interface ShellRouteModel {
  isChatDomain: boolean;
  isAppsDomain: boolean;
  isTerminalDomain: boolean;
  isDriveDomain: boolean;
  isUserDomain: boolean;
  isAppsDetailPage: boolean;
  isAgentsDomain: boolean;
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
  activeAgentRole,
  activeAppName
}: BuildShellRouteModelInput): ShellRouteModel {
  const { activeDomain, appsPane, chatMode, chatOverlayType, hasChatOverlay, terminalPane } = routeSnapshot;
  const isChatDomain = activeDomain === 'chat';
  const isAppsDomain = activeDomain === 'apps';
  const isTerminalDomain = activeDomain === 'terminal';
  const isDriveDomain = activeDomain === 'drive';
  const isUserDomain = activeDomain === 'user';
  const isAppsDetailPage = isAppsDomain && appsPane === 'detail';
  const isLegacyAgentsPublishPage = routeSnapshot.agentsPane === 'publish';

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
      ? 'My PC'
      : '会话'
    : isDriveDomain
    ? 'My PC'
    : isLegacyAgentsPublishPage
    ? '发布中心'
    : isAppsDomain
    ? activeAppName || DOMAIN_LABEL[activeDomain]
    : DOMAIN_LABEL[activeDomain];

  const showBottomNav =
    !(
      (isChatDomain && hasChatOverlay) ||
      (isTerminalDomain && terminalPane !== 'list') ||
      (isAppsDomain && appsPane === 'detail') ||
      isLegacyAgentsPublishPage
    ) && chatMode !== 'search';

  return {
    isChatDomain,
    isAppsDomain,
    isTerminalDomain,
    isDriveDomain,
    isUserDomain,
    isAppsDetailPage,
    isAgentsDomain: isLegacyAgentsPublishPage,
    isAgentsPublishPage: isLegacyAgentsPublishPage,
    isChatDetailOverlay,
    isChatAgentOverlay,
    isChatListTopNav,
    showBottomNav,
    topNavTitle,
    topNavSubtitle: isChatDomain && isChatDetailOverlay ? activeAgentRole : ''
  };
}
