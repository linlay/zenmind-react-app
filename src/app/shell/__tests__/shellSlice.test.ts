import shellReducer, {
  closeChatDetailDrawer,
  openChatDetailDrawer,
  resetChatDetailDrawerPreview,
  setChatDetailDrawerPreviewProgress,
  setChatAgentsSidebarOpen,
  setChatSearchQuery
} from '../shellSlice';

describe('shellSlice', () => {
  it('updates chat search and sidebar state', () => {
    const initial = shellReducer(undefined, { type: 'unknown' });

    const next = shellReducer(initial, setChatSearchQuery('部署'));
    expect(next.chatSearchQuery).toBe('部署');

    const next2 = shellReducer(next, setChatAgentsSidebarOpen(true));
    expect(next2.chatAgentsSidebarOpen).toBe(true);
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
