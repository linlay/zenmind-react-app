import { PayloadAction, createSlice } from '@reduxjs/toolkit';

interface ShellState {
  chatSearchQuery: string;
  chatAgentsSidebarOpen: boolean;
  chatDetailDrawerOpen: boolean;
  chatDetailDrawerPreviewProgress: number;
}

const initialState: ShellState = {
  chatSearchQuery: '',
  chatAgentsSidebarOpen: false,
  chatDetailDrawerOpen: false,
  chatDetailDrawerPreviewProgress: 0
};

const shellSlice = createSlice({
  name: 'shell',
  initialState,
  reducers: {
    setChatSearchQuery(state, action: PayloadAction<string>) {
      state.chatSearchQuery = action.payload;
    },
    setChatAgentsSidebarOpen(state, action: PayloadAction<boolean>) {
      state.chatAgentsSidebarOpen = action.payload;
    },
    setChatDetailDrawerPreviewProgress(state, action: PayloadAction<number>) {
      const normalized = Number.isFinite(action.payload) ? action.payload : 0;
      state.chatDetailDrawerPreviewProgress = Math.max(0, Math.min(1, normalized));
    },
    resetChatDetailDrawerPreview(state) {
      state.chatDetailDrawerPreviewProgress = 0;
    },
    openChatDetailDrawer(state) {
      state.chatDetailDrawerOpen = true;
      state.chatDetailDrawerPreviewProgress = 1;
    },
    closeChatDetailDrawer(state) {
      state.chatDetailDrawerOpen = false;
      state.chatDetailDrawerPreviewProgress = 0;
    }
  }
});

export const {
  setChatSearchQuery,
  setChatAgentsSidebarOpen,
  setChatDetailDrawerPreviewProgress,
  resetChatDetailDrawerPreview,
  openChatDetailDrawer,
  closeChatDetailDrawer
} = shellSlice.actions;

export default shellSlice.reducer;
