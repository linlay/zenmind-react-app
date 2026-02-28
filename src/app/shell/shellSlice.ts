import { PayloadAction, createSlice } from '@reduxjs/toolkit';

interface ShellState {
  chatPane: 'list' | 'detail' | 'agent';
  terminalPane: 'list' | 'detail';
  chatAgentsSidebarOpen: boolean;
  chatDetailDrawerOpen: boolean;
}

const initialState: ShellState = {
  chatPane: 'list',
  terminalPane: 'list',
  chatAgentsSidebarOpen: false,
  chatDetailDrawerOpen: false
};

const shellSlice = createSlice({
  name: 'shell',
  initialState,
  reducers: {
    setChatPane(state, action: PayloadAction<'list' | 'detail' | 'agent'>) {
      state.chatPane = action.payload;
    },
    setTerminalPane(state, action: PayloadAction<'list' | 'detail'>) {
      state.terminalPane = action.payload;
    },
    setChatAgentsSidebarOpen(state, action: PayloadAction<boolean>) {
      state.chatAgentsSidebarOpen = action.payload;
    },
    setChatDetailDrawerOpen(state, action: PayloadAction<boolean>) {
      state.chatDetailDrawerOpen = action.payload;
    },
    openChatDetailDrawer(state) {
      state.chatDetailDrawerOpen = true;
    },
    closeChatDetailDrawer(state) {
      state.chatDetailDrawerOpen = false;
    },
    showChatListPane(state) {
      state.chatPane = 'list';
      state.chatDetailDrawerOpen = false;
      state.chatAgentsSidebarOpen = false;
    },
    showChatDetailPane(state) {
      state.chatPane = 'detail';
    },
    showChatAgentPane(state) {
      state.chatPane = 'agent';
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
  setChatPane,
  setTerminalPane,
  setChatAgentsSidebarOpen,
  setChatDetailDrawerOpen,
  openChatDetailDrawer,
  closeChatDetailDrawer,
  showChatListPane,
  showChatDetailPane,
  showChatAgentPane,
  showTerminalListPane,
  showTerminalDetailPane
} = shellSlice.actions;
export default shellSlice.reducer;
