import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { ChatSummary } from '../../../core/types/common';

interface ChatUiState {
  chats: ChatSummary[];
  chatId: string;
  statusText: string;
  loadingChats: boolean;
}

const initialState: ChatUiState = {
  chats: [],
  chatId: '',
  statusText: '',
  loadingChats: false
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setChats(state, action: PayloadAction<ChatSummary[]>) {
      state.chats = action.payload;
    },
    setChatId(state, action: PayloadAction<string>) {
      state.chatId = action.payload;
    },
    setStatusText(state, action: PayloadAction<string>) {
      state.statusText = action.payload;
    },
    setLoadingChats(state, action: PayloadAction<boolean>) {
      state.loadingChats = action.payload;
    }
  }
});

export const { setChats, setChatId, setStatusText, setLoadingChats } = chatSlice.actions;
export default chatSlice.reducer;
