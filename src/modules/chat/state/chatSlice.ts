import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { ChatSummary } from '../../../core/types/common';

interface ChatUiState {
  chats: ChatSummary[];
  chatId: string;
  chatKeyword: string;
  statusText: string;
  loadingChats: boolean;
}

const initialState: ChatUiState = {
  chats: [],
  chatId: '',
  chatKeyword: '',
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
    setChatKeyword(state, action: PayloadAction<string>) {
      state.chatKeyword = action.payload;
    },
    setStatusText(state, action: PayloadAction<string>) {
      state.statusText = action.payload;
    },
    setLoadingChats(state, action: PayloadAction<boolean>) {
      state.loadingChats = action.payload;
    }
  }
});

export const { setChats, setChatId, setChatKeyword, setStatusText, setLoadingChats } = chatSlice.actions;
export default chatSlice.reducer;
