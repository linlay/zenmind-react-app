import type {
  OpenableWebApp,
  WebAppCatalog,
  WebAppItem,
  WebAppResident,
  WebAppResidentLoadState,
  WebAppsConnectionStatus,
  WebAppsGatewayError
} from './types';
import { normalizeWebAppPublicUrl, sortWebAppItems } from './webAppsDesktopProtocol.ts';

export const MAX_RESIDENT_WEB_APPS = 6;

export type WebAppsRuntimeState = {
  items: readonly WebAppItem[];
  residents: readonly WebAppResident[];
  lastUrlById: Readonly<Record<string, string>>;
  activeAppId: string | null;
  desktopDeviceId: string;
  tunnelConnected: boolean;
  generatedAt: string;
  connectionStatus: WebAppsConnectionStatus;
  initialized: boolean;
  loading: boolean;
  refreshing: boolean;
  error: WebAppsGatewayError | null;
  detailVisible: boolean;
  selectorVisible: boolean;
};

export type WebAppsRuntimeAction =
  | { type: 'sync.started' }
  | { type: 'snapshot.received'; catalog: WebAppCatalog }
  | { type: 'sync.failed'; error: WebAppsGatewayError }
  | { type: 'item.received'; item: WebAppItem }
  | { type: 'item.removed'; appId: string }
  | { type: 'connection.changed'; status: WebAppsConnectionStatus }
  | { type: 'detail.entered'; preferredAppId?: string }
  | { type: 'detail.left' }
  | { type: 'selector.changed'; visible: boolean }
  | { type: 'app.selected'; appId: string }
  | { type: 'resident.loadState'; appId: string; generation: number; loadState: WebAppResidentLoadState }
  | { type: 'resident.reloaded'; appId: string }
  | { type: 'resident.urlChanged'; appId: string; url: string };

export const INITIAL_WEB_APPS_RUNTIME_STATE: WebAppsRuntimeState = {
  items: [],
  residents: [],
  lastUrlById: {},
  activeAppId: null,
  desktopDeviceId: '',
  tunnelConnected: false,
  generatedAt: '',
  connectionStatus: 'idle',
  initialized: false,
  loading: false,
  refreshing: false,
  error: null,
  detailVisible: false,
  selectorVisible: false
};

export function normalizeWebAppUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function isOpenableWebApp(item: WebAppItem | undefined): item is OpenableWebApp {
  return Boolean(
    item?.runtimeStatus === 'running' && item.availability === 'available' && normalizeWebAppPublicUrl(item.publicUrl)
  );
}

export function getOpenableWebApps(items: readonly WebAppItem[]): OpenableWebApp[] {
  return items.filter(isOpenableWebApp);
}

export function shouldRetainWebAppResident(item: WebAppItem | undefined): boolean {
  return Boolean(
    item?.runtimeStatus === 'running' &&
    item.publishStatus !== 'not-configured' &&
    item.publishStatus !== 'unpublished' &&
    item.availability !== 'not-published' &&
    item.availability !== 'webapp-stopped'
  );
}

function webAppItemsEqual(left: WebAppItem, right: WebAppItem): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.order === right.order &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.runtimeStatus === right.runtimeStatus &&
    left.publishStatus === right.publishStatus &&
    left.availability === right.availability &&
    left.publicUrl === right.publicUrl
  );
}

function upsertItem(items: readonly WebAppItem[], item: WebAppItem): readonly WebAppItem[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0 && webAppItemsEqual(items[index], item)) {
    return items;
  }
  const next = index < 0 ? [...items, item] : [...items];
  if (index >= 0) {
    next[index] = item;
  }
  return sortWebAppItems(next);
}

function touchResident(
  residents: readonly WebAppResident[],
  item: WebAppItem & { publicUrl: string },
  lastUrl: string,
  limit = MAX_RESIDENT_WEB_APPS
): WebAppResident[] {
  const existing = residents.find((resident) => resident.appId === item.id);
  const entry: WebAppResident = existing
    ? existing.launchUrl === item.publicUrl
      ? existing
      : {
          ...existing,
          launchUrl: item.publicUrl,
          url: item.publicUrl,
          generation: existing.generation + 1,
          loadState: 'loading'
        }
    : {
        appId: item.id,
        launchUrl: item.publicUrl,
        url: normalizeWebAppUrl(lastUrl) || item.publicUrl,
        generation: 0,
        loadState: 'loading'
      };

  return [entry, ...residents.filter((resident) => resident.appId !== item.id)].slice(0, limit);
}

function reconcileResidents(residents: readonly WebAppResident[], items: readonly WebAppItem[]): WebAppResident[] {
  const retainedById = new Map(
    items.filter((item) => shouldRetainWebAppResident(item)).map((item) => [item.id, item] as const)
  );
  let changed = false;
  const next = residents.flatMap((resident) => {
    const item = retainedById.get(resident.appId);
    if (!item) {
      changed = true;
      return [];
    }
    const publicUrl = normalizeWebAppPublicUrl(item.publicUrl);
    if (!publicUrl || publicUrl === resident.launchUrl) {
      return [resident];
    }
    changed = true;
    return [
      {
        ...resident,
        launchUrl: publicUrl,
        url: publicUrl,
        generation: resident.generation + 1,
        loadState: 'loading' as const
      }
    ];
  });
  return changed ? next : (residents as WebAppResident[]);
}

function reconcileLastUrls(
  previousItems: readonly WebAppItem[],
  nextItems: readonly WebAppItem[],
  previousLastUrlById: Readonly<Record<string, string>>,
  previousResidents: readonly WebAppResident[]
): Readonly<Record<string, string>> {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const previousLaunchById = new Map(previousResidents.map((resident) => [resident.appId, resident.launchUrl]));
  const next: Record<string, string> = {};
  for (const item of nextItems.filter((candidate) => shouldRetainWebAppResident(candidate))) {
    const previousItem = previousById.get(item.id);
    const publicUrl = normalizeWebAppPublicUrl(item.publicUrl);
    const previousPublicUrl = normalizeWebAppPublicUrl(previousItem?.publicUrl);
    const previousLaunchUrl = previousPublicUrl || previousLaunchById.get(item.id) || '';
    const lastUrl = normalizeWebAppUrl(previousLastUrlById[item.id]);
    if (shouldRetainWebAppResident(previousItem) && (!publicUrl || previousLaunchUrl === publicUrl)) {
      const retainedUrl = lastUrl || previousLaunchUrl;
      if (retainedUrl) {
        next[item.id] = retainedUrl;
      }
    } else if (publicUrl) {
      next[item.id] = publicUrl;
    }
  }
  return next;
}

function reconcileRuntime(
  state: WebAppsRuntimeState,
  items: readonly WebAppItem[],
  preferredAppId?: string
): Pick<WebAppsRuntimeState, 'residents' | 'activeAppId'> {
  let residents = reconcileResidents(state.residents, items);
  const openableApps = getOpenableWebApps(items);
  const openableById = new Map(openableApps.map((item) => [item.id, item]));
  const retainedById = new Map(
    items.filter((item) => shouldRetainWebAppResident(item)).map((item) => [item.id, item] as const)
  );
  const shouldKeepActive = Boolean(state.activeAppId) || state.detailVisible || Boolean(preferredAppId);

  if (!shouldKeepActive) {
    return { residents, activeAppId: null };
  }

  const canUsePreferred =
    Boolean(preferredAppId && openableById.has(preferredAppId)) &&
    (state.connectionStatus === 'connected' || residents.some((resident) => resident.appId === preferredAppId));
  const activeAppId =
    (canUsePreferred && preferredAppId ? preferredAppId : null) ??
    (state.activeAppId &&
    retainedById.has(state.activeAppId) &&
    residents.some((resident) => resident.appId === state.activeAppId)
      ? state.activeAppId
      : null) ??
    residents.find((resident) => openableById.has(resident.appId))?.appId ??
    (state.connectionStatus === 'connected' ? openableApps[0]?.id : null) ??
    null;

  const activeItem = activeAppId ? openableById.get(activeAppId) : undefined;
  if (
    activeItem &&
    (state.connectionStatus === 'connected' || residents.some((resident) => resident.appId === activeItem.id))
  ) {
    residents = touchResident(residents, activeItem, state.lastUrlById[activeItem.id] || activeItem.publicUrl);
  }

  return { residents, activeAppId };
}

function applyItems(state: WebAppsRuntimeState, items: readonly WebAppItem[]): WebAppsRuntimeState {
  const sortedItems = sortWebAppItems(items);
  const lastUrlById = reconcileLastUrls(state.items, sortedItems, state.lastUrlById, state.residents);
  const nextState = { ...state, lastUrlById };
  const runtime = reconcileRuntime(nextState, sortedItems);
  return { ...state, ...runtime, items: sortedItems, lastUrlById };
}

export function webAppsRuntimeReducer(state: WebAppsRuntimeState, action: WebAppsRuntimeAction): WebAppsRuntimeState {
  switch (action.type) {
    case 'sync.started':
      return {
        ...state,
        loading: !state.initialized,
        refreshing: state.initialized,
        error: null
      };
    case 'snapshot.received': {
      const next = applyItems(state, action.catalog.items);
      return {
        ...next,
        desktopDeviceId: action.catalog.desktopDeviceId,
        tunnelConnected: action.catalog.tunnelConnected,
        generatedAt: action.catalog.generatedAt,
        initialized: true,
        loading: false,
        refreshing: false,
        error: null
      };
    }
    case 'sync.failed':
      return {
        ...state,
        initialized: true,
        loading: false,
        refreshing: false,
        error: action.error
      };
    case 'item.received': {
      const items = upsertItem(state.items, action.item);
      if (items === state.items) {
        return state.error ? { ...state, error: null } : state;
      }
      return { ...applyItems(state, items), error: null };
    }
    case 'item.removed': {
      const items = state.items.filter((item) => item.id !== action.appId);
      if (items.length === state.items.length) {
        return state;
      }
      return { ...applyItems(state, items), error: null };
    }
    case 'connection.changed':
      return {
        ...state,
        connectionStatus: action.status,
        selectorVisible: action.status === 'connected' ? state.selectorVisible : false,
        refreshing: state.initialized && (action.status === 'connecting' || action.status === 'reconnecting')
      };
    case 'detail.entered': {
      const enteredState = { ...state, detailVisible: true, selectorVisible: false };
      return { ...enteredState, ...reconcileRuntime(enteredState, state.items, action.preferredAppId) };
    }
    case 'detail.left':
      return { ...state, detailVisible: false, selectorVisible: false };
    case 'selector.changed':
      return state.selectorVisible === (state.detailVisible && action.visible)
        ? state
        : { ...state, selectorVisible: state.detailVisible && action.visible };
    case 'app.selected': {
      const item = state.items.find((candidate) => candidate.id === action.appId);
      if (!isOpenableWebApp(item) || state.connectionStatus !== 'connected') {
        return state;
      }
      return {
        ...state,
        activeAppId: item.id,
        residents: touchResident(state.residents, item, state.lastUrlById[item.id] || item.publicUrl),
        selectorVisible: false
      };
    }
    case 'resident.loadState':
      if (
        !state.residents.some(
          (resident) =>
            resident.appId === action.appId &&
            resident.generation === action.generation &&
            resident.loadState !== action.loadState
        )
      ) {
        return state;
      }
      return {
        ...state,
        residents: state.residents.map((resident) =>
          resident.appId === action.appId && resident.generation === action.generation
            ? { ...resident, loadState: action.loadState }
            : resident
        )
      };
    case 'resident.reloaded':
      return {
        ...state,
        residents: state.residents.map((resident) =>
          resident.appId === action.appId
            ? { ...resident, generation: resident.generation + 1, loadState: 'loading' }
            : resident
        )
      };
    case 'resident.urlChanged': {
      const url = normalizeWebAppUrl(action.url);
      if (!url) {
        return state;
      }
      const resident = state.residents.find((candidate) => candidate.appId === action.appId);
      if (!resident || resident.url === url) {
        return state;
      }
      return {
        ...state,
        lastUrlById: { ...state.lastUrlById, [action.appId]: url },
        residents: state.residents.map((resident) =>
          resident.appId === action.appId ? { ...resident, url } : resident
        )
      };
    }
    default:
      return state;
  }
}
