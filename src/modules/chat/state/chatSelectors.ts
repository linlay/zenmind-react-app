import { RootState } from '../../../app/store/store';
import { getChatTimestamp } from '../../../shared/utils/format';

export const selectChats = (state: RootState) => state.chat.chats;
export const selectChatId = (state: RootState) => state.chat.chatId;
export const selectChatKeyword = (state: RootState) => state.chat.chatKeyword;

export const selectFilteredChats = (state: RootState) => {
  const chats = state.chat.chats;
  const keyword = state.chat.chatKeyword.trim().toLowerCase();
  const sorted = [...chats].sort((a, b) => getChatTimestamp(b) - getChatTimestamp(a));
  if (!keyword) return sorted;

  return sorted.filter((chat) => {
    const haystack = `${chat.chatName || ''} ${chat.chatId || ''} ${chat.firstAgentKey || ''}`.toLowerCase();
    return haystack.includes(keyword);
  });
};
