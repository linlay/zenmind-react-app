import { PayloadAction, createSlice } from '@reduxjs/toolkit';

export type ChatRoute = 'list' | 'search';
export type ChatOverlayType = 'agentDetail' | 'chatDetail';
export type ShellRouteName =
  | 'chat/list'
  | 'chat/search'
  | 'chat/agentDetail'
  | 'chat/chatDetail'
  | 'terminal/list'
  | 'terminal/detail'
  | 'agents/index'
  | 'user/index';

export interface ChatOverlayState {
  overlayId: string;
  type: ChatOverlayType;
}

export interface ShellRouteEntry {
  routeId: string;
  name: ShellRouteName;
}

interface ShellState {
  routeStack: ShellRouteEntry[];
  chatRoute: ChatRoute;
  chatSearchQuery: string;
  chatOverlayStack: ChatOverlayState[];
  terminalPane: 'list' | 'detail';
  chatAgentsSidebarOpen: boolean;
  chatDetailDrawerOpen: boolean;
  chatDetailDrawerPreviewProgress: number;
}

const initialState: ShellState = {
  routeStack: [{ routeId: 'chat_list_root', name: 'chat/list' }],
  chatRoute: 'list',
  chatSearchQuery: '',
  chatOverlayStack: [],
  terminalPane: 'list',
  chatAgentsSidebarOpen: false,
  chatDetailDrawerOpen: false,
  chatDetailDrawerPreviewProgress: 0
};

const OVERLAY_ROUTES: ReadonlyArray<ShellRouteName> = ['chat/agentDetail', 'chat/chatDetail'];

function toOverlayType(routeName: ShellRouteName): ChatOverlayType | '' {
  if (routeName === 'chat/agentDetail') {
    return 'agentDetail';
  }
  if (routeName === 'chat/chatDetail') {
    return 'chatDetail';
  }
  return '';
}

function syncDerivedRouteState(state: ShellState) {
  const chatBaseRoutes = state.routeStack.filter((route) => route.name === 'chat/list' || route.name === 'chat/search');
  const terminalRoutes = state.routeStack.filter(
    (route) => route.name === 'terminal/list' || route.name === 'terminal/detail'
  );
  const overlayRoutes = state.routeStack.filter((route) => OVERLAY_ROUTES.includes(route.name));

  const topChatBaseRoute = chatBaseRoutes.length ? chatBaseRoutes[chatBaseRoutes.length - 1] : null;
  const topTerminalRoute = terminalRoutes.length ? terminalRoutes[terminalRoutes.length - 1] : null;

  state.chatRoute = topChatBaseRoute?.name === 'chat/search' ? 'search' : 'list';
  state.terminalPane = topTerminalRoute?.name === 'terminal/detail' ? 'detail' : 'list';
  state.chatOverlayStack = overlayRoutes
    .map((route) => {
      const type = toOverlayType(route.name);
      if (!type) {
        return null;
      }
      return {
        overlayId: route.routeId,
        type
      };
    })
    .filter((item): item is ChatOverlayState => Boolean(item));
}

function ensureChatBaseRoute(state: ShellState) {
  const hasChatBase = state.routeStack.some((route) => route.name === 'chat/list' || route.name === 'chat/search');
  if (!hasChatBase) {
    state.routeStack.unshift({ routeId: 'chat_list_root', name: 'chat/list' });
  }
}

function appendRoute(state: ShellState, name: ShellRouteName, routeId?: string) {
  state.routeStack.push({
    routeId: routeId || `${name}_${Date.now()}`,
    name
  });
  syncDerivedRouteState(state);
}

function replaceTopRoute(state: ShellState, name: ShellRouteName, routeId?: string) {
  if (!state.routeStack.length) {
    appendRoute(state, name, routeId);
    return;
  }
  state.routeStack[state.routeStack.length - 1] = {
    routeId: routeId || `${name}_${Date.now()}`,
    name
  };
  syncDerivedRouteState(state);
}

const shellSlice = createSlice({
  name: 'shell',
  initialState,
  reducers: {
    pushRoute(state, action: PayloadAction<ShellRouteEntry>) {
      appendRoute(state, action.payload.name, action.payload.routeId);
    },
    replaceRoute(state, action: PayloadAction<ShellRouteEntry>) {
      replaceTopRoute(state, action.payload.name, action.payload.routeId);
    },
    resetRoutes(state, action: PayloadAction<ShellRouteEntry>) {
      state.routeStack = [action.payload];
      syncDerivedRouteState(state);
    },
    goBackRoute(state) {
      if (state.routeStack.length <= 1) {
        return;
      }
      state.routeStack = state.routeStack.slice(0, -1);
      ensureChatBaseRoute(state);
      syncDerivedRouteState(state);
    },
    setChatSearchQuery(state, action: PayloadAction<string>) {
      state.chatSearchQuery = action.payload;
    },
    pushChatOverlay(state, action: PayloadAction<ChatOverlayState>) {
      const routeName = action.payload.type === 'chatDetail' ? 'chat/chatDetail' : 'chat/agentDetail';
      appendRoute(state, routeName, action.payload.overlayId);
    },
    popChatOverlay(state) {
      const lastOverlayIndex = [...state.routeStack].reverse().findIndex((route) => OVERLAY_ROUTES.includes(route.name));
      if (lastOverlayIndex < 0) {
        return;
      }
      const routeIndex = state.routeStack.length - 1 - lastOverlayIndex;
      state.routeStack = state.routeStack.filter((_, idx) => idx !== routeIndex);
      ensureChatBaseRoute(state);
      syncDerivedRouteState(state);
      state.chatDetailDrawerOpen = false;
      state.chatDetailDrawerPreviewProgress = 0;
    },
    clearChatOverlays(state) {
      state.routeStack = state.routeStack.filter((route) => !OVERLAY_ROUTES.includes(route.name));
      ensureChatBaseRoute(state);
      syncDerivedRouteState(state);
      state.chatDetailDrawerOpen = false;
      state.chatDetailDrawerPreviewProgress = 0;
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
    },
    showChatListRoute(state) {
      state.routeStack = state.routeStack.filter((route) => {
        if (OVERLAY_ROUTES.includes(route.name)) {
          return false;
        }
        return route.name !== 'chat/search';
      });
      if (!state.routeStack.some((route) => route.name === 'chat/list')) {
        state.routeStack.unshift({ routeId: 'chat_list_root', name: 'chat/list' });
      }
      syncDerivedRouteState(state);
      state.chatSearchQuery = '';
      state.chatDetailDrawerOpen = false;
      state.chatDetailDrawerPreviewProgress = 0;
      state.chatAgentsSidebarOpen = false;
    },
    showChatSearchRoute(state) {
      state.routeStack = state.routeStack.filter((route) => route.name !== 'chat/search');
      ensureChatBaseRoute(state);
      appendRoute(state, 'chat/search', 'chat_search_route');
    },
    showTerminalListPane(state) {
      state.routeStack = state.routeStack.filter((route) => route.name !== 'terminal/detail');
      if (!state.routeStack.some((route) => route.name === 'terminal/list')) {
        appendRoute(state, 'terminal/list', 'terminal_list_route');
        return;
      }
      syncDerivedRouteState(state);
    },
    showTerminalDetailPane(state) {
      state.routeStack = state.routeStack.filter((route) => route.name !== 'terminal/detail');
      if (!state.routeStack.some((route) => route.name === 'terminal/list')) {
        state.routeStack.push({ routeId: 'terminal_list_route', name: 'terminal/list' });
      }
      appendRoute(state, 'terminal/detail', 'terminal_detail_route');
    },
    showAgentsRoute(state) {
      state.routeStack = state.routeStack.filter((route) => route.name !== 'agents/index');
      appendRoute(state, 'agents/index', 'agents_index_route');
    },
    showUserRoute(state) {
      state.routeStack = state.routeStack.filter((route) => route.name !== 'user/index');
      appendRoute(state, 'user/index', 'user_index_route');
    }
  }
});

export const {
  pushRoute,
  replaceRoute,
  resetRoutes,
  goBackRoute,
  setChatSearchQuery,
  pushChatOverlay,
  popChatOverlay,
  clearChatOverlays,
  setChatAgentsSidebarOpen,
  setChatDetailDrawerPreviewProgress,
  resetChatDetailDrawerPreview,
  openChatDetailDrawer,
  closeChatDetailDrawer,
  showChatListRoute,
  showChatSearchRoute,
  showTerminalListPane,
  showTerminalDetailPane,
  showAgentsRoute,
  showUserRoute
} = shellSlice.actions;
export default shellSlice.reducer;
