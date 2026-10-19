import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';

import type {
  OpenableWebApp,
  WebAppItem,
  WebAppResidentLoadState,
  WebAppsGateway,
  WebAppsGatewayCapabilities,
  WebAppsGatewayEvent
} from './types';
import { WebAppsRuntimeHost } from './WebAppsRuntimeHost';
import { webAppsGateway } from './webAppsGateway';
import {
  getOpenableWebApps,
  INITIAL_WEB_APPS_RUNTIME_STATE,
  normalizeWebAppUrl,
  webAppsRuntimeReducer,
  type WebAppsRuntimeAction,
  type WebAppsRuntimeState
} from './webAppsRuntimeModel';

type WebAppsRuntimeContextValue = WebAppsRuntimeState & {
  enabled: boolean;
  openableApps: readonly OpenableWebApp[];
  activeApp: WebAppItem | null;
  capabilities: WebAppsGatewayCapabilities;
  refresh: () => Promise<void>;
  prepareDetail: (preferredAppId?: string) => string | null;
  enterDetail: (preferredAppId: string | undefined, onRequestClose: () => void) => void;
  leaveDetail: () => void;
  closeSelector: () => void;
};

type WebAppsRuntimeProviderProps = {
  children: ReactNode;
  enabled: boolean;
  gateway?: WebAppsGateway;
  sessionKey: string;
};

const WebAppsRuntimeContext = createContext<WebAppsRuntimeContextValue | null>(null);
const PROVIDER_ROOT_CLASS = 'flex-1';

export function WebAppsRuntimeProvider({
  children,
  enabled,
  gateway = webAppsGateway,
  sessionKey
}: WebAppsRuntimeProviderProps) {
  const [state, setState] = useState(INITIAL_WEB_APPS_RUNTIME_STATE);
  const stateRef = useRef(state);
  const mountedRef = useRef(true);
  const requestDetailCloseRef = useRef<(() => void) | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const recoveryQueueRef = useRef<string[]>([]);
  const recoveringAppIdRef = useRef<string | null>(null);
  const recoveryAttemptsByIdRef = useRef(new Map<string, number>());
  const sessionGenerationRef = useRef(0);

  const commit = useCallback((action: WebAppsRuntimeAction) => {
    if (!mountedRef.current) {
      return;
    }
    setState((current) => {
      const next = webAppsRuntimeReducer(current, action);
      stateRef.current = next;
      return next;
    });
  }, []);

  const startNextRecovery = useCallback(() => {
    if (!mountedRef.current || appStateRef.current !== 'active' || recoveringAppIdRef.current) {
      return;
    }

    while (recoveryQueueRef.current.length > 0) {
      const appId = recoveryQueueRef.current.shift();
      if (!appId || !stateRef.current.residents.some((resident) => resident.appId === appId)) {
        continue;
      }
      recoveringAppIdRef.current = appId;
      commit({ type: 'resident.reloaded', appId });
      return;
    }
  }, [commit]);

  const sortRecoveryQueue = useCallback(() => {
    const activeAppId = stateRef.current.activeAppId;
    const rank = new Map(stateRef.current.residents.map((resident, index) => [resident.appId, index]));
    recoveryQueueRef.current.sort((left, right) => {
      if (left === activeAppId) {
        return -1;
      }
      if (right === activeAppId) {
        return 1;
      }
      return (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER);
    });
  }, []);

  const queueRecovery = useCallback(
    (appId: string) => {
      if (!recoveryQueueRef.current.includes(appId)) {
        recoveryQueueRef.current.push(appId);
      }
      sortRecoveryQueue();
      startNextRecovery();
    },
    [sortRecoveryQueue, startNextRecovery]
  );

  const handleResidentLoadState = useCallback(
    (appId: string, generation: number, loadState: WebAppResidentLoadState) => {
      commit({ type: 'resident.loadState', appId, generation, loadState });
      if (loadState === 'ready') {
        recoveryAttemptsByIdRef.current.delete(appId);
      }
      if (recoveringAppIdRef.current === appId && (loadState === 'ready' || loadState === 'error')) {
        recoveringAppIdRef.current = null;
        startNextRecovery();
      }
    },
    [commit, startNextRecovery]
  );

  const handleResidentTerminated = useCallback(
    (appId: string, generation: number) => {
      const resident = stateRef.current.residents.find((candidate) => candidate.appId === appId);
      if (!resident || resident.generation !== generation) {
        return;
      }
      const recoveryAttempts = recoveryAttemptsByIdRef.current;
      const attempts = (recoveryAttempts.get(appId) ?? 0) + 1;
      recoveryAttempts.set(appId, attempts);
      if (recoveringAppIdRef.current === appId) {
        recoveringAppIdRef.current = null;
      }
      commit({
        type: 'resident.loadState',
        appId,
        generation,
        loadState: attempts > 1 ? 'error' : 'terminated'
      });
      if (attempts > 1) {
        startNextRecovery();
        return;
      }
      queueRecovery(appId);
    },
    [commit, queueRecovery, startNextRecovery]
  );

  const handleResidentNavigation = useCallback(
    (appId: string, url: string) => {
      const normalizedUrl = normalizeWebAppUrl(url);
      if (normalizedUrl) {
        commit({ type: 'resident.urlChanged', appId, url: normalizedUrl });
      }
    },
    [commit]
  );

  const retryResident = useCallback(
    (appId: string) => {
      recoveryQueueRef.current = recoveryQueueRef.current.filter((candidate) => candidate !== appId);
      if (recoveringAppIdRef.current === appId) {
        recoveringAppIdRef.current = null;
      }
      recoveryAttemptsByIdRef.current.delete(appId);
      commit({ type: 'resident.reloaded', appId });
    },
    [commit]
  );

  const handleGatewayEvent = useCallback(
    (event: WebAppsGatewayEvent) => {
      switch (event.type) {
        case 'snapshot':
          commit({ type: 'snapshot.received', catalog: event.catalog });
          return;
        case 'upsert':
          commit({ type: 'item.received', item: event.item });
          return;
        case 'remove':
          recoveryQueueRef.current = recoveryQueueRef.current.filter((appId) => appId !== event.appId);
          recoveryAttemptsByIdRef.current.delete(event.appId);
          if (recoveringAppIdRef.current === event.appId) {
            recoveringAppIdRef.current = null;
          }
          commit({ type: 'item.removed', appId: event.appId });
          startNextRecovery();
          return;
        case 'connection':
          commit({ type: 'connection.changed', status: event.status });
          return;
        case 'error':
          commit({ type: 'sync.failed', error: event.error });
      }
    },
    [commit, startNextRecovery]
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    commit({ type: 'sync.started' });
    try {
      await gateway.refresh();
    } catch {
      // Gateway emits the normalized error event. Abort/close requires no UI update.
    }
  }, [commit, enabled, gateway]);

  const prepareDetail = useCallback(
    (preferredAppId?: string): string | null => {
      const runtime = stateRef.current;
      if (runtime.connectionStatus !== 'connected') {
        return null;
      }
      const openableApps = getOpenableWebApps(runtime.items);
      const candidateId =
        (preferredAppId && openableApps.some((item) => item.id === preferredAppId) ? preferredAppId : null) ??
        (runtime.activeAppId && openableApps.some((item) => item.id === runtime.activeAppId)
          ? runtime.activeAppId
          : null) ??
        runtime.residents.find((resident) => openableApps.some((item) => item.id === resident.appId))?.appId ??
        openableApps[0]?.id ??
        null;
      if (candidateId) {
        commit({ type: 'app.selected', appId: candidateId });
      }
      return candidateId;
    },
    [commit]
  );

  const enterDetail = useCallback(
    (preferredAppId: string | undefined, onRequestClose: () => void) => {
      requestDetailCloseRef.current = onRequestClose;
      commit({ type: 'detail.entered', preferredAppId });
    },
    [commit]
  );
  const leaveDetail = useCallback(() => {
    requestDetailCloseRef.current = null;
    commit({ type: 'detail.left' });
  }, [commit]);
  const closeSelector = useCallback(() => commit({ type: 'selector.changed', visible: false }), [commit]);
  const requestBack = useCallback(() => {
    if (stateRef.current.selectorVisible) {
      closeSelector();
      return;
    }
    requestDetailCloseRef.current?.();
  }, [closeSelector]);
  const openSelector = useCallback(() => {
    if (stateRef.current.connectionStatus === 'connected' && getOpenableWebApps(stateRef.current.items).length > 0) {
      commit({ type: 'selector.changed', visible: true });
    }
  }, [commit]);
  const selectApp = useCallback((appId: string) => commit({ type: 'app.selected', appId }), [commit]);

  useEffect(() => {
    const sessionGeneration = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = sessionGeneration;
    mountedRef.current = enabled;
    requestDetailCloseRef.current = null;
    appStateRef.current = AppState.currentState;
    recoveryQueueRef.current = [];
    recoveringAppIdRef.current = null;
    recoveryAttemptsByIdRef.current.clear();
    stateRef.current = INITIAL_WEB_APPS_RUNTIME_STATE;
    setState(INITIAL_WEB_APPS_RUNTIME_STATE);

    if (!enabled) {
      return () => {
        if (sessionGenerationRef.current === sessionGeneration) {
          sessionGenerationRef.current += 1;
          mountedRef.current = false;
        }
      };
    }
    const recoveryAttempts = recoveryAttemptsByIdRef.current;
    const handleSessionGatewayEvent = (event: WebAppsGatewayEvent) => {
      if (sessionGenerationRef.current === sessionGeneration) {
        handleGatewayEvent(event);
      }
    };
    commit({ type: 'sync.started' });
    gateway.open(handleSessionGatewayEvent);
    return () => {
      if (sessionGenerationRef.current === sessionGeneration) {
        sessionGenerationRef.current += 1;
        mountedRef.current = false;
      }
      gateway.close();
      recoveryQueueRef.current = [];
      recoveringAppIdRef.current = null;
      recoveryAttempts.clear();
    };
  }, [commit, enabled, gateway, handleGatewayEvent, sessionKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if ((previousState === 'background' || previousState === 'inactive') && nextState === 'active') {
        sortRecoveryQueue();
        startNextRecovery();
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [enabled, refresh, sortRecoveryQueue, startNextRecovery]);

  const openableApps = useMemo(() => getOpenableWebApps(state.items), [state.items]);
  const activeApp = useMemo(
    () => state.items.find((item) => item.id === state.activeAppId) ?? null,
    [state.activeAppId, state.items]
  );
  const contextValue = useMemo<WebAppsRuntimeContextValue>(
    () => ({
      ...state,
      enabled,
      openableApps,
      activeApp,
      capabilities: gateway.capabilities,
      refresh,
      prepareDetail,
      enterDetail,
      leaveDetail,
      closeSelector
    }),
    [
      activeApp,
      closeSelector,
      enterDetail,
      enabled,
      gateway.capabilities,
      leaveDetail,
      openableApps,
      prepareDetail,
      refresh,
      state
    ]
  );

  return (
    <WebAppsRuntimeContext.Provider value={contextValue}>
      <View className={PROVIDER_ROOT_CLASS}>
        {children}
        {enabled ? (
          <WebAppsRuntimeHost
            visible={state.detailVisible}
            selectorVisible={state.selectorVisible}
            activeApp={activeApp}
            openableApps={openableApps}
            residents={state.residents}
            connectionStatus={state.connectionStatus}
            onBack={requestBack}
            onOpenSelector={openSelector}
            onCloseSelector={closeSelector}
            onSelectApp={selectApp}
            onResidentLoadState={handleResidentLoadState}
            onResidentTerminated={handleResidentTerminated}
            onResidentNavigation={handleResidentNavigation}
            onRetryResident={retryResident}
          />
        ) : null}
      </View>
    </WebAppsRuntimeContext.Provider>
  );
}

export function useWebAppsRuntime(): WebAppsRuntimeContextValue {
  const value = useContext(WebAppsRuntimeContext);
  if (!value) {
    throw new Error('useWebAppsRuntime must be used within WebAppsRuntimeProvider');
  }
  return value;
}
