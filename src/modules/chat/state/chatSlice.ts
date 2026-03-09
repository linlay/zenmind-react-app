import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { ChatSummary, TeamSummary } from '../../../core/types/common';

interface ChatUiState {
  chats: ChatSummary[];
  chatId: string;
  loadingChats: boolean;
  teams: TeamSummary[];
}

const initialState: ChatUiState = {
  chats: [],
  chatId: '',
  loadingChats: false,
  teams: []
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setChats(state, action: PayloadAction<ChatSummary[]>) {
      state.chats = action.payload;
    },
    setTeams(state, action: PayloadAction<TeamSummary[]>) {
      state.teams = action.payload;
    },
    setChatId(state, action: PayloadAction<string>) {
      state.chatId = action.payload;
    },
    setLoadingChats(state, action: PayloadAction<boolean>) {
      state.loadingChats = action.payload;
    }
  }
});

export const { setChats, setTeams, setChatId, setLoadingChats } = chatSlice.actions;
export default chatSlice.reducer;
