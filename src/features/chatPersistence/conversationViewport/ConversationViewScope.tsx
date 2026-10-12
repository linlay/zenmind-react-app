import { createContext, useContext } from 'react';

export const ConversationViewScope = createContext('');
export const useConversationViewChatId = () => useContext(ConversationViewScope);
