import { PayloadAction, createSlice } from '@reduxjs/toolkit';

export type ChatRoute = 'list' | 'search';
export type ChatOverlayType = 'agentDetail' | 'chatDetail';

export interface ChatOverlayState {
  overlayId: string;
  type: ChatOverlayType;
}

interface ShellState {
  chatRoute: ChatRoute;
  chatSearchQuery: string;
  chatOverlayStack: ChatOverlayState[];
  terminalPane: 'list' | 'detail';
  chatAgentsSidebarOpen: boolean;
  chatDetailDrawerOpen: boolean;
  chatDetailDrawerPreviewProgress: number;
}

const initialState: ShellState = {
  chatRoute: 'list',
  chatSearchQuery: '',
  chatOverlayStack: [],
  terminalPane: 'list',
  chatAgentsSidebarOpen: false,
  chatDetailDrawerOpen: false,
  chatDetailDrawerPreviewProgress: 0
};

const shellSlice = createSlice({
  name: 'shell',
  initialState,
  reducers: {
    setChatRoute(state, action: PayloadAction<ChatRoute>) {
      state.chatRoute = action.payload;
    },
    setChatSearchQuery(state, action: PayloadAction<string>) {
      state.chatSearchQuery = action.payload;
    },
    pushChatOverlay(state, action: PayloadAction<ChatOverlayState>) {
      state.chatOverlayStack.push(action.payload);
    },
    popChatOverlay(state) {
      if (!state.chatOverlayStack.length) {
        return;
      }
      state.chatOverlayStack = state.chatOverlayStack.slice(0, -1);
      state.chatDetailDrawerOpen = false;
      state.chatDetailDrawerPreviewProgress = 0;
    },
    clearChatOverlays(state) {
      state.chatOverlayStack = [];
      state.chatDetailDrawerOpen = false;
      state.chatDetailDrawerPreviewProgress = 0;
    },
    setTerminalPane(state, action: PayloadAction<'list' | 'detail'>) {
      state.terminalPane = action.payload;
    },
    setChatAgentsSidebarOpen(state, action: PayloadAction<boolean>) {
      state.chatAgentsSidebarOpen = action.payload;
    },
    setChatDetailDrawerOpen(state, action: PayloadAction<boolean>) {
      state.chatDetailDrawerOpen = action.payload;
      if (!action.payload) {
        state.chatDetailDrawerPreviewProgress = 0;
      }
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
    },
    showChatListRoute(state) {
      state.chatRoute = 'list';
      state.chatSearchQuery = '';
      state.chatDetailDrawerOpen = false;
      state.chatDetailDrawerPreviewProgress = 0;
      state.chatAgentsSidebarOpen = false;
    },
    showChatSearchRoute(state) {
      state.chatRoute = 'search';
    },
    showTerminalListPane(state) {
      state.terminalPane = 'list';
    },
    showTerminalDetailPane(state) {
      state.terminalPane = 'detail';
    }
  }
});

export const {
  setChatRoute,
  setChatSearchQuery,
  pushChatOverlay,
  popChatOverlay,
  clearChatOverlays,
  setTerminalPane,
  setChatAgentsSidebarOpen,
  setChatDetailDrawerOpen,
  setChatDetailDrawerPreviewProgress,
  resetChatDetailDrawerPreview,
  openChatDetailDrawer,
  closeChatDetailDrawer,
  showChatListRoute,
  showChatSearchRoute,
  showTerminalListPane,
  showTerminalDetailPane
} = shellSlice.actions;
export default shellSlice.reducer;
