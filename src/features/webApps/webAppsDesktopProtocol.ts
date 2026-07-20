import type { WebAppAvailability, WebAppCatalog, WebAppItem, WebAppPublishStatus, WebAppRuntimeStatus } from './types';

export type WebAppChangedReason =
  | 'installed'
  | 'updated'
  | 'published'
  | 'unpublished'
  | 'removed'
  | 'route-synced'
  | 'publish-failed';

export type WebAppChanged = {
  reason: WebAppChangedReason;
  webappId: string;
  changedAt: string;
  item: WebAppItem | null;
};

const RUNTIME_STATUSES = new Set<WebAppRuntimeStatus>(['stopped', 'starting', 'running', 'error']);
const PUBLISH_STATUSES = new Set<WebAppPublishStatus>([
  'not-configured',
  'ready',
  'publishing',
  'published',
  'unpublished',
  'error'
]);
const AVAILABILITIES = new Set<WebAppAvailability>([
  'available',
  'not-published',
  'publishing',
  'desktop-offline',
  'webapp-stopped',
  'publish-error'
]);
const CHANGE_REASONS = new Set<WebAppChangedReason>([
  'installed',
  'updated',
  'published',
  'unpublished',
  'removed',
  'route-synced',
  'publish-failed'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readRequiredText(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new Error(`Invalid WebApps protocol field: ${field}`);
  }
  return text;
}

function readTimestamp(value: unknown, field: string): string {
  const timestamp = readRequiredText(value, field);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`Invalid WebApps protocol timestamp: ${field}`);
  }
  return timestamp;
}

function readNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid WebApps protocol number: ${field}`);
  }
  return value;
}

export function normalizeWebAppPublicUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function parseWebAppItem(value: unknown): WebAppItem {
  if (!isRecord(value)) {
    throw new Error('Invalid WebApps protocol item');
  }

  const runtimeStatus = value.runtimeStatus;
  const publishStatus = value.publishStatus;
  const availability = value.availability;
  if (!RUNTIME_STATUSES.has(runtimeStatus as WebAppRuntimeStatus)) {
    throw new Error('Invalid WebApps runtimeStatus');
  }
  if (!PUBLISH_STATUSES.has(publishStatus as WebAppPublishStatus)) {
    throw new Error('Invalid WebApps publishStatus');
  }
  if (!AVAILABILITIES.has(availability as WebAppAvailability)) {
    throw new Error('Invalid WebApps availability');
  }
  if (typeof value.available !== 'boolean' || value.available !== (availability === 'available')) {
    throw new Error('Invalid WebApps available flag');
  }

  const publicUrl = normalizeWebAppPublicUrl(value.publicUrl);
  return {
    id: readRequiredText(value.id, 'id'),
    name: readRequiredText(value.label, 'label'),
    order: readNonNegativeNumber(value.order, 'order'),
    createdAt: readNonNegativeNumber(value.createdAt, 'createdAt'),
    updatedAt: readNonNegativeNumber(value.updatedAt, 'updatedAt'),
    runtimeStatus: runtimeStatus as WebAppRuntimeStatus,
    publishStatus: publishStatus as WebAppPublishStatus,
    availability: availability as WebAppAvailability,
    ...(publicUrl ? { publicUrl } : {})
  };
}

export function sortWebAppItems(items: readonly WebAppItem[]): WebAppItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => left.item.order - right.item.order || left.index - right.index)
    .map(({ item }) => item);
}

export function parseWebAppCatalog(value: unknown): WebAppCatalog {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.tunnelConnected !== 'boolean') {
    throw new Error('Invalid WebApps catalog');
  }

  const seenIds = new Set<string>();
  const items = value.items.map((itemValue) => {
    const item = parseWebAppItem(itemValue);
    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate WebApp id: ${item.id}`);
    }
    seenIds.add(item.id);
    return item;
  });

  return {
    desktopDeviceId: readRequiredText(value.desktopDeviceId, 'desktopDeviceId'),
    tunnelConnected: value.tunnelConnected,
    generatedAt: readTimestamp(value.generatedAt, 'generatedAt'),
    items: sortWebAppItems(items)
  };
}

export function parseWebAppChanged(value: unknown): WebAppChanged {
  if (!isRecord(value)) {
    throw new Error('Invalid webapp.changed payload');
  }

  const reason = value.reason;
  if (!CHANGE_REASONS.has(reason as WebAppChangedReason)) {
    throw new Error('Invalid webapp.changed reason');
  }

  const webappId = readRequiredText(value.webappId, 'webappId');
  const item = value.item === null ? null : parseWebAppItem(value.item);
  if ((reason === 'removed') !== (item === null)) {
    throw new Error('Invalid webapp.changed item');
  }
  if (item && item.id !== webappId) {
    throw new Error('Mismatched webapp.changed item id');
  }

  return {
    reason: reason as WebAppChangedReason,
    webappId,
    changedAt: readTimestamp(value.changedAt, 'changedAt'),
    item
  };
}

export function parseWebAppChangedFrame(frame: unknown): WebAppChanged | null {
  if (!isRecord(frame) || frame.frame !== 'push' || frame.type !== 'webapp.changed') {
    return null;
  }
  const namespace = typeof frame.ns === 'string' ? frame.ns.trim() : '';
  if (namespace && namespace !== 'd') {
    return null;
  }
  return parseWebAppChanged(frame.data ?? frame.payload);
}

export function applyWebAppChanged(catalog: WebAppCatalog, change: WebAppChanged): WebAppCatalog {
  if (!change.item) {
    const items = catalog.items.filter((item) => item.id !== change.webappId);
    return items.length === catalog.items.length ? catalog : { ...catalog, items };
  }

  const existingIndex = catalog.items.findIndex((item) => item.id === change.webappId);
  const items = existingIndex < 0 ? [...catalog.items, change.item] : [...catalog.items];
  if (existingIndex >= 0) {
    items[existingIndex] = change.item;
  }
  return { ...catalog, items: sortWebAppItems(items) };
}
