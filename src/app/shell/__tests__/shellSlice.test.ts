import shellReducer, {
  closeChatDetailDrawer,
  openChatDetailDrawer,
  setChatAgentsSidebarOpen,
  setChatDetailDrawerOpen,
  setChatPane,
  setTerminalPane,
  showChatDetailPane,
  showChatListPane,
  showTerminalDetailPane,
  showTerminalListPane
} from '../shellSlice';

describe('shellSlice', () => {
  it('updates pane state and sidebar state', () => {
    const initial = shellReducer(undefined, { type: 'unknown' });

    const next = shellReducer(initial, setChatPane('detail'));
    expect(next.chatPane).toBe('detail');

    const next2 = shellReducer(next, setTerminalPane('detail'));
    expect(next2.terminalPane).toBe('detail');

    const next3 = shellReducer(next2, setChatAgentsSidebarOpen(true));
    expect(next3.chatAgentsSidebarOpen).toBe(true);

    const next4 = shellReducer(next3, setChatDetailDrawerOpen(true));
    expect(next4.chatDetailDrawerOpen).toBe(true);
  });

  it('supports quick actions for list/detail switching', () => {
    let state = shellReducer(undefined, { type: 'unknown' });
    state = shellReducer(state, showChatDetailPane());
    expect(state.chatPane).toBe('detail');
    state = shellReducer(state, showChatListPane());
    expect(state.chatPane).toBe('list');

    state = shellReducer(state, showTerminalDetailPane());
    expect(state.terminalPane).toBe('detail');
    state = shellReducer(state, showTerminalListPane());
    expect(state.terminalPane).toBe('list');
  });

  it('supports chat detail drawer actions', () => {
    let state = shellReducer(undefined, { type: 'unknown' });
    state = shellReducer(state, openChatDetailDrawer());
    expect(state.chatDetailDrawerOpen).toBe(true);
    state = shellReducer(state, closeChatDetailDrawer());
    expect(state.chatDetailDrawerOpen).toBe(false);
  });
});
