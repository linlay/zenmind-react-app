import { configureStore } from '@reduxjs/toolkit';
import shellReducer from '../shell/shellSlice';
import uiReducer from '../ui/uiSlice';
import userReducer from '../../modules/user/state/userSlice';
import agentsReducer from '../../modules/agents/state/agentsSlice';
import chatReducer from '../../modules/chat/state/chatSlice';
import terminalReducer from '../../modules/terminal/state/terminalSlice';
import { chatApi } from '../../modules/chat/api/chatApi';
import { agentsApi } from '../../modules/agents/api/agentsApi';
import { terminalApi } from '../../modules/terminal/api/terminalApi';
import { appsApi } from '../shell/pages/apps/appsApi';

export const store = configureStore({
  reducer: {
    shell: shellReducer,
    ui: uiReducer,
    user: userReducer,
    agents: agentsReducer,
    chat: chatReducer,
    terminal: terminalReducer,
    [chatApi.reducerPath]: chatApi.reducer,
    [agentsApi.reducerPath]: agentsApi.reducer,
    [terminalApi.reducerPath]: terminalApi.reducer,
    [appsApi.reducerPath]: appsApi.reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false
    }).concat(chatApi.middleware, agentsApi.middleware, terminalApi.middleware, appsApi.middleware)
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
