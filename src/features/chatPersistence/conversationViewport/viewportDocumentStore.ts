import {
  CONVERSATION_PREVIEW_MAX_SOURCE_BYTES,
  getConversationPreviewSourceByteLength
} from '../../../shared/components/conversationPreview/runtimeBridge.ts';

const DEFAULT_CACHE_LIMIT = 12;
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;

type CachedViewportDocument = {
  html: string;
  cachedAt: number;
};

type InFlightViewportDocument = {
  version: number;
  promise: Promise<string>;
};

export type ConversationViewportDocumentStore = {
  clear: () => void;
  getCached: (viewportKey: string) => string;
  load: (viewportKey: string, options?: { force?: boolean }) => Promise<string>;
};

export function createConversationViewportDocumentStore(
  loader: (viewportKey: string) => Promise<{ html?: string }>,
  options: { cacheLimit?: number; cacheTtlMs?: number; now?: () => number } = {}
): ConversationViewportDocumentStore {
  const cacheLimit = Math.max(1, Math.trunc(options.cacheLimit ?? DEFAULT_CACHE_LIMIT));
  const cacheTtlMs = Math.max(0, Math.trunc(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS));
  const now = options.now ?? Date.now;
  const cache = new Map<string, CachedViewportDocument>();
  const inFlight = new Map<string, InFlightViewportDocument>();
  const versions = new Map<string, number>();

  const normalizeKey = (viewportKey: string) => String(viewportKey || '').trim();
  const readCached = (viewportKey: string): string => {
    const key = normalizeKey(viewportKey);
    const cached = cache.get(key);
    if (!cached) {
      return '';
    }
    if (now() - cached.cachedAt > cacheTtlMs) {
      cache.delete(key);
      if (!inFlight.has(key)) {
        versions.delete(key);
      }
      return '';
    }
    cache.delete(key);
    cache.set(key, cached);
    return cached.html;
  };

  const writeCached = (key: string, html: string) => {
    cache.delete(key);
    cache.set(key, { html, cachedAt: now() });
    while (cache.size > cacheLimit) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      cache.delete(oldestKey);
      if (!inFlight.has(oldestKey)) {
        versions.delete(oldestKey);
      }
    }
  };

  return {
    clear() {
      cache.clear();
      inFlight.clear();
      versions.clear();
    },
    getCached: readCached,
    load(viewportKey, loadOptions = {}) {
      const key = normalizeKey(viewportKey);
      if (!key) {
        return Promise.reject(new Error('Viewport key is required.'));
      }

      if (!loadOptions.force) {
        const cached = readCached(key);
        if (cached) {
          return Promise.resolve(cached);
        }
      }

      const previousVersion = versions.get(key) ?? 0;
      const version = loadOptions.force ? previousVersion + 1 : previousVersion;
      versions.set(key, version);
      const existing = inFlight.get(key);
      if (existing?.version === version) {
        return existing.promise;
      }

      const promise = loader(key)
        .then((response) => {
          const html = String(response.html || '').trim();
          if (!html) {
            throw new Error('Viewport response does not contain html.');
          }
          if (getConversationPreviewSourceByteLength(html) > CONVERSATION_PREVIEW_MAX_SOURCE_BYTES) {
            throw new Error('Viewport html exceeds the 256 KiB safety limit.');
          }
          if (versions.get(key) === version) {
            writeCached(key, html);
          }
          return html;
        })
        .finally(() => {
          if (inFlight.get(key)?.promise === promise) {
            inFlight.delete(key);
            if (!cache.has(key)) {
              versions.delete(key);
            }
          }
        });
      inFlight.set(key, { version, promise });
      return promise;
    }
  };
}
