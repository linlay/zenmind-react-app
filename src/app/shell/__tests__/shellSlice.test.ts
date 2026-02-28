import shellReducer, {
  clearChatOverlays,
  closeChatDetailDrawer,
  openChatDetailDrawer,
  popChatOverlay,
  pushChatOverlay,
  resetChatDetailDrawerPreview,
  setChatDetailDrawerPreviewProgress,
  setChatAgentsSidebarOpen,
  setChatSearchQuery,
  showChatListRoute,
  showChatSearchRoute,
  showTerminalDetailPane,
  showTerminalListPane
} from '../shellSlice';

describe('shellSlice', () => {
  it('updates route/sidebar/search state', () => {
    const initial = shellReducer(undefined, { type: 'unknown' });

    const next = shellReducer(initial, showChatSearchRoute());
    expect(next.chatRoute).toBe('search');

    const next2 = shellReducer(next, setChatSearchQuery('部署'));
    expect(next2.chatSearchQuery).toBe('部署');

    const next3 = shellReducer(next2, showTerminalDetailPane());
    expect(next3.terminalPane).toBe('detail');

    const next4 = shellReducer(next3, setChatAgentsSidebarOpen(true));
    expect(next4.chatAgentsSidebarOpen).toBe(true);
  });

  it('supports chat overlay stack actions', () => {
    let state = shellReducer(undefined, { type: 'unknown' });

    state = shellReducer(
      state,
      pushChatOverlay({ overlayId: 'overlay-agent-1', type: 'agentDetail' })
    );
    state = shellReducer(
      state,
      pushChatOverlay({ overlayId: 'overlay-chat-1', type: 'chatDetail' })
    );
    expect(state.chatOverlayStack).toHaveLength(2);
    expect(state.chatOverlayStack[1].type).toBe('chatDetail');

    state = shellReducer(state, popChatOverlay());
    expect(state.chatOverlayStack).toHaveLength(1);

    state = shellReducer(state, clearChatOverlays());
    expect(state.chatOverlayStack).toHaveLength(0);
  });

  it('supports route quick actions', () => {
    let state = shellReducer(undefined, { type: 'unknown' });

    state = shellReducer(state, showChatSearchRoute());
    expect(state.chatRoute).toBe('search');

    state = shellReducer(state, showChatListRoute());
    expect(state.chatRoute).toBe('list');
    expect(state.chatSearchQuery).toBe('');
    expect(state.chatDetailDrawerOpen).toBe(false);
    expect(state.chatDetailDrawerPreviewProgress).toBe(0);
    expect(state.chatAgentsSidebarOpen).toBe(false);

    state = shellReducer(state, showTerminalDetailPane());
    expect(state.terminalPane).toBe('detail');
    state = shellReducer(state, showTerminalListPane());
    expect(state.terminalPane).toBe('list');
  });

  it('supports chat detail drawer actions', () => {
    let state = shellReducer(undefined, { type: 'unknown' });
    state = shellReducer(state, setChatDetailDrawerPreviewProgress(0.42));
    expect(state.chatDetailDrawerPreviewProgress).toBe(0.42);

    state = shellReducer(state, openChatDetailDrawer());
    expect(state.chatDetailDrawerOpen).toBe(true);
    expect(state.chatDetailDrawerPreviewProgress).toBe(1);

    state = shellReducer(state, closeChatDetailDrawer());
    expect(state.chatDetailDrawerOpen).toBe(false);
    expect(state.chatDetailDrawerPreviewProgress).toBe(0);

    state = shellReducer(state, setChatDetailDrawerPreviewProgress(0.73));
    state = shellReducer(state, resetChatDetailDrawerPreview());
    expect(state.chatDetailDrawerPreviewProgress).toBe(0);
  });
});
