import type { WsSocketStatus } from '../../core/ws/wsClient';
import type { DesktopWsTransportConfig, WsTransportConfig } from '../../core/ws/wsTransportConfig';
import type {
  WebAppCatalog,
  WebAppsConnectionStatus,
  WebAppsGateway,
  WebAppsGatewayError,
  WebAppsGatewayErrorCode,
  WebAppsGatewayEvent
} from './types';
import {
  applyWebAppChanged,
  parseWebAppCatalog,
  parseWebAppChangedFrame,
  type WebAppChanged
} from './webAppsDesktopProtocol.ts';

type ActiveWebAppsProfile = {
  transportKind: 'http' | 'desktop-ws';
  desktopDeviceId: string;
};

type WebAppsRequestOptions = {
  transport: WsTransportConfig;
  namespace: 'd';
  type: string;
  payload?: unknown;
  signal?: AbortSignal;
};

export type WebAppsGatewayDependencies = {
  getActiveProfile: () => ActiveWebAppsProfile | null;
  resolveTransport: (namespace: 'd') => Promise<WsTransportConfig | null>;
  request: <T>(options: WebAppsRequestOptions) => Promise<T>;
  subscribePush: (listener: (frame: unknown) => void) => () => void;
  subscribeStatus: (listener: (status: WsSocketStatus) => void) => () => void;
  getStatus: () => WsSocketStatus;
};

const WEBAPP_EVENT_TYPES = ['webapp.changed'] as const;
const READONLY_CAPABILITIES = Object.freeze({ activate: false, pause: false });

class WebAppsGatewayFailure extends Error {
  readonly code: WebAppsGatewayErrorCode;

  constructor(code: WebAppsGatewayErrorCode, message: string) {
    super(message);
    this.name = 'WebAppsGatewayFailure';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function toGatewayError(error: unknown): WebAppsGatewayError {
  if (error instanceof WebAppsGatewayFailure) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'desktop-unavailable',
    message: error instanceof Error && error.message.trim() ? error.message : 'Desktop WebApps is unavailable.'
  };
}

function validateSubscriptionResponse(value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value.types) || !value.types.includes('webapp.changed')) {
    throw new WebAppsGatewayFailure('invalid-protocol', 'Desktop returned an invalid WebApps subscription response.');
  }
}

function createSyncController(signal?: AbortSignal): { controller: AbortController; dispose: () => void } {
  const controller = new AbortController();
  if (!signal) {
    return { controller, dispose: () => undefined };
  }
  if (signal.aborted) {
    controller.abort();
    return { controller, dispose: () => undefined };
  }
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  return {
    controller,
    dispose: () => signal.removeEventListener('abort', abort)
  };
}

function mapSocketStatus(status: WsSocketStatus): WebAppsConnectionStatus {
  return status;
}

export function createDesktopWebAppsGateway(dependencies: WebAppsGatewayDependencies): WebAppsGateway {
  let listener: ((event: WebAppsGatewayEvent) => void) | null = null;
  let transport: DesktopWsTransportConfig | null = null;
  let expectedDesktopDeviceId = '';
  let unsubscribePush: (() => void) | null = null;
  let unsubscribeStatus: (() => void) | null = null;
  let activeController: AbortController | null = null;
  let syncPromise: Promise<WebAppCatalog> | null = null;
  let syncGeneration = -1;
  let generation = 0;
  let opened = false;
  let remoteSubscribed = false;
  let buffering = false;
  let bufferedChanges: WebAppChanged[] = [];
  let rawSocketStatus: WsSocketStatus = 'idle';
  let resyncRequested = false;

  const emit = (event: WebAppsGatewayEvent) => {
    if (opened) {
      listener?.(event);
    }
  };

  const emitChange = (change: WebAppChanged) => {
    if (change.item) {
      emit({ type: 'upsert', item: change.item });
    } else {
      emit({ type: 'remove', appId: change.webappId });
    }
  };

  const discardSynchronization = () => {
    generation += 1;
    activeController?.abort();
    activeController = null;
    buffering = false;
    bufferedChanges = [];
  };

  const synchronize = (signal?: AbortSignal): Promise<WebAppCatalog> => {
    if (!opened) {
      return Promise.reject(createAbortError());
    }
    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }
    if (syncPromise) {
      return syncPromise;
    }

    const currentGeneration = generation;
    const { controller, dispose } = createSyncController(signal);
    activeController = controller;
    syncGeneration = currentGeneration;
    buffering = true;
    bufferedChanges = [];

    syncPromise = (async () => {
      const profile = dependencies.getActiveProfile();
      if (!profile || profile.transportKind !== 'desktop-ws') {
        throw new WebAppsGatewayFailure('desktop-required', 'WebApps requires an active Desktop WebSocket connection.');
      }

      const resolvedTransport = await dependencies.resolveTransport('d');
      if (!resolvedTransport || resolvedTransport.kind !== 'desktop-ws') {
        throw new WebAppsGatewayFailure('desktop-unavailable', 'Desktop is not connected.');
      }
      if (!opened || currentGeneration !== generation || controller.signal.aborted) {
        throw createAbortError();
      }

      transport = resolvedTransport;
      expectedDesktopDeviceId = profile.desktopDeviceId;
      if (!remoteSubscribed) {
        const subscription = await dependencies.request<unknown>({
          transport: resolvedTransport,
          namespace: 'd',
          type: 'event.subscribe',
          payload: { types: WEBAPP_EVENT_TYPES },
          signal: controller.signal
        });
        validateSubscriptionResponse(subscription);
        if (!opened || currentGeneration !== generation || controller.signal.aborted) {
          throw createAbortError();
        }
        remoteSubscribed = true;
      }

      const rawCatalog = await dependencies.request<unknown>({
        transport: resolvedTransport,
        namespace: 'd',
        type: 'web.webapp.list',
        payload: {},
        signal: controller.signal
      });
      if (!opened || currentGeneration !== generation || controller.signal.aborted) {
        throw createAbortError();
      }

      let catalog: WebAppCatalog;
      try {
        catalog = parseWebAppCatalog(rawCatalog);
      } catch (error) {
        throw new WebAppsGatewayFailure(
          'invalid-protocol',
          error instanceof Error ? error.message : 'Desktop returned an invalid WebApps catalog.'
        );
      }
      if (catalog.desktopDeviceId !== expectedDesktopDeviceId) {
        throw new WebAppsGatewayFailure('device-mismatch', 'Desktop WebApps catalog belongs to another device.');
      }

      for (const change of bufferedChanges) {
        catalog = applyWebAppChanged(catalog, change);
      }
      bufferedChanges = [];
      buffering = false;
      emit({ type: 'snapshot', catalog });
      emit({ type: 'connection', status: 'connected' });
      return catalog;
    })()
      .catch((error: unknown) => {
        const shouldReplayBufferedChanges = opened && currentGeneration === generation;
        const changes = shouldReplayBufferedChanges ? bufferedChanges : [];
        bufferedChanges = [];
        buffering = false;
        changes.forEach(emitChange);
        if (!isAbortError(error) && opened && currentGeneration === generation) {
          emit({ type: 'error', error: toGatewayError(error) });
        }
        throw error;
      })
      .finally(() => {
        dispose();
        if (activeController === controller) {
          activeController = null;
        }
        syncPromise = null;
        syncGeneration = -1;
        if (resyncRequested && opened) {
          resyncRequested = false;
          void synchronize().catch(() => undefined);
        }
      });

    return syncPromise;
  };

  const handlePush = (frame: unknown) => {
    if (!opened) {
      return;
    }
    try {
      const change = parseWebAppChangedFrame(frame);
      if (!change) {
        return;
      }
      if (buffering) {
        bufferedChanges.push(change);
      } else {
        emitChange(change);
      }
    } catch (error) {
      emit({
        type: 'error',
        error: {
          code: 'invalid-protocol',
          message: error instanceof Error ? error.message : 'Desktop returned an invalid webapp.changed event.'
        }
      });
    }
  };

  const handleStatus = (status: WsSocketStatus) => {
    const previousStatus = rawSocketStatus;
    rawSocketStatus = status;
    if (!opened) {
      return;
    }

    if (status === 'connected') {
      if (syncPromise && syncGeneration !== generation) {
        resyncRequested = true;
      } else if (!syncPromise && (previousStatus !== 'connected' || !remoteSubscribed)) {
        void synchronize().catch(() => undefined);
      }
      return;
    }

    emit({ type: 'connection', status: mapSocketStatus(status) });
    if (status === 'reconnecting' || status === 'disconnected' || status === 'error') {
      remoteSubscribed = false;
      discardSynchronization();
    }
  };

  const close = () => {
    if (!opened) {
      return;
    }
    const unsubscribeTransport = transport;
    const shouldUnsubscribe = dependencies.getStatus() === 'connected' && unsubscribeTransport;
    opened = false;
    listener = null;
    unsubscribePush?.();
    unsubscribeStatus?.();
    unsubscribePush = null;
    unsubscribeStatus = null;
    discardSynchronization();
    remoteSubscribed = false;
    resyncRequested = false;
    transport = null;
    expectedDesktopDeviceId = '';
    if (shouldUnsubscribe) {
      void dependencies
        .request({
          transport: unsubscribeTransport,
          namespace: 'd',
          type: 'event.unsubscribe',
          payload: { types: WEBAPP_EVENT_TYPES }
        })
        .catch(() => undefined);
    }
  };

  return {
    capabilities: READONLY_CAPABILITIES,
    open(nextListener) {
      if (opened) {
        close();
      }
      opened = true;
      listener = nextListener;
      generation += 1;
      if (syncPromise && syncGeneration !== generation) {
        resyncRequested = true;
      }
      rawSocketStatus = dependencies.getStatus();
      unsubscribePush = dependencies.subscribePush(handlePush);
      unsubscribeStatus = dependencies.subscribeStatus(handleStatus);
      void synchronize().catch(() => undefined);
    },
    async refresh(signal) {
      await synchronize(signal);
    },
    close
  };
}
