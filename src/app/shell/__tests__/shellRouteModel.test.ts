import { buildShellRouteModel } from '../routes/shellRouteModel';
import { buildShellRouteSnapshot } from '../routes/shellRouteSnapshot';

describe('shell route snapshot and model', () => {
  it('maps chat search route to search title and hides bottom nav', () => {
    const routeSnapshot = buildShellRouteSnapshot({
      activeDomain: 'chat',
      agentsRouteName: 'AgentsList',
      chatRouteName: 'ChatSearch',
      terminalRouteName: 'TerminalList'
    });

    const routeModel = buildShellRouteModel({
      routeSnapshot,
      activeAgentName: 'Agent 1',
      activeAgentRole: '任务调度助手'
    });

    expect(routeSnapshot.chatMode).toBe('search');
    expect(routeModel.topNavTitle).toBe('搜索');
    expect(routeModel.showBottomNav).toBe(false);
  });

  it('maps chat detail route to agent title and subtitle', () => {
    const routeSnapshot = buildShellRouteSnapshot({
      activeDomain: 'chat',
      agentsRouteName: 'AgentsList',
      chatRouteName: 'ChatDetail',
      terminalRouteName: 'TerminalList'
    });

    const routeModel = buildShellRouteModel({
      routeSnapshot,
      activeAgentName: 'Agent 1',
      activeAgentRole: '任务调度助手'
    });

    expect(routeSnapshot.chatOverlayType).toBe('chatDetail');
    expect(routeModel.isChatDetailOverlay).toBe(true);
    expect(routeModel.topNavTitle).toBe('Agent 1');
    expect(routeModel.topNavSubtitle).toBe('任务调度助手');
    expect(routeModel.showBottomNav).toBe(false);
  });

  it('maps agent profile route to overlay state without subtitle', () => {
    const routeSnapshot = buildShellRouteSnapshot({
      activeDomain: 'chat',
      agentsRouteName: 'AgentsList',
      chatRouteName: 'AgentProfile',
      terminalRouteName: 'TerminalList'
    });

    const routeModel = buildShellRouteModel({
      routeSnapshot,
      activeAgentName: 'Agent 1',
      activeAgentRole: '任务调度助手'
    });

    expect(routeSnapshot.chatOverlayType).toBe('agentDetail');
    expect(routeModel.isChatAgentOverlay).toBe(true);
    expect(routeModel.topNavTitle).toBe('Agent 1');
    expect(routeModel.topNavSubtitle).toBe('');
    expect(routeModel.showBottomNav).toBe(false);
  });

  it('maps terminal detail route to detail title and hides bottom nav', () => {
    const routeSnapshot = buildShellRouteSnapshot({
      activeDomain: 'terminal',
      agentsRouteName: 'AgentsList',
      chatRouteName: 'ChatList',
      terminalRouteName: 'TerminalDetail'
    });

    const routeModel = buildShellRouteModel({
      routeSnapshot,
      activeAgentName: 'Agent 1',
      activeAgentRole: '任务调度助手'
    });

    expect(routeSnapshot.terminalPane).toBe('detail');
    expect(routeModel.topNavTitle).toBe('终端/CLI');
    expect(routeModel.showBottomNav).toBe(false);
  });

  it('maps terminal drive route to drive title and hides bottom nav', () => {
    const routeSnapshot = buildShellRouteSnapshot({
      activeDomain: 'terminal',
      agentsRouteName: 'AgentsList',
      chatRouteName: 'ChatList',
      terminalRouteName: 'TerminalDrive'
    });

    const routeModel = buildShellRouteModel({
      routeSnapshot,
      activeAgentName: 'Agent 1',
      activeAgentRole: '任务调度助手'
    });

    expect(routeSnapshot.terminalPane).toBe('drive');
    expect(routeModel.topNavTitle).toBe('网盘');
    expect(routeModel.showBottomNav).toBe(false);
  });

  it('maps agents publish route to publish title and hides bottom nav', () => {
    const routeSnapshot = buildShellRouteSnapshot({
      activeDomain: 'agents',
      agentsRouteName: 'AgentsPublish',
      chatRouteName: 'ChatList',
      terminalRouteName: 'TerminalList'
    });

    const routeModel = buildShellRouteModel({
      routeSnapshot,
      activeAgentName: 'Agent 1',
      activeAgentRole: '任务调度助手'
    });

    expect(routeSnapshot.agentsPane).toBe('publish');
    expect(routeModel.isAgentsPublishPage).toBe(true);
    expect(routeModel.topNavTitle).toBe('发布中心');
    expect(routeModel.showBottomNav).toBe(false);
  });
});
