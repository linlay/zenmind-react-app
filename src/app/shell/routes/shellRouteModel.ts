import { DomainMode } from "../../../core/types/common";
import { ChatOverlayType, ChatRoute } from "../shellSlice";

const DOMAIN_LABEL: Record<DomainMode, string> = {
  chat: "对话",
  terminal: "终端",
  agents: "智能体",
  user: "配置",
};

interface BuildShellRouteModelInput {
  activeDomain: DomainMode;
  chatRoute: ChatRoute;
  topChatOverlayType: ChatOverlayType | "";
  hasChatOverlay: boolean;
  terminalPane: "list" | "detail";
  activeAgentName: string;
  activeAgentRole: string;
}

export interface ShellRouteModel {
  isChatDomain: boolean;
  isTerminalDomain: boolean;
  isAgentsDomain: boolean;
  isUserDomain: boolean;
  isChatDetailOverlay: boolean;
  isChatAgentOverlay: boolean;
  isChatListTopNav: boolean;
  showBottomNav: boolean;
  topNavTitle: string;
  topNavSubtitle: string;
}

export function buildShellRouteModel({
  activeDomain,
  chatRoute,
  topChatOverlayType,
  hasChatOverlay,
  terminalPane,
  activeAgentName,
  activeAgentRole,
}: BuildShellRouteModelInput): ShellRouteModel {
  const isChatDomain = activeDomain === "chat";
  const isTerminalDomain = activeDomain === "terminal";
  const isAgentsDomain = activeDomain === "agents";
  const isUserDomain = activeDomain === "user";

  const isChatDetailOverlay = topChatOverlayType === "chatDetail";
  const isChatAgentOverlay = topChatOverlayType === "agentDetail";
  const isChatListTopNav =
    isChatDomain && !hasChatOverlay && chatRoute === "list";

  const topNavTitle = isChatDomain
    ? isChatDetailOverlay
      ? activeAgentName
      : isChatAgentOverlay
        ? activeAgentName
        : chatRoute === "search"
          ? "搜索"
          : "对话"
    : isTerminalDomain
      ? terminalPane === "detail"
        ? "终端/CLI"
        : "会话"
      : DOMAIN_LABEL[activeDomain];

  // 情况1: 聊天详情页面
  // 情况2: 终端页面
  const showBottomNav =
    !(
      (isChatDomain && hasChatOverlay) ||
      (isTerminalDomain && terminalPane === "detail")
    ) && chatRoute !== "search";

  return {
    isChatDomain,
    isTerminalDomain,
    isAgentsDomain,
    isUserDomain,
    isChatDetailOverlay,
    isChatAgentOverlay,
    isChatListTopNav,
    showBottomNav,
    topNavTitle,
    topNavSubtitle: isChatDomain && isChatDetailOverlay ? activeAgentRole : "",
  };
}
