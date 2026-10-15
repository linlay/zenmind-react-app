import { fetch } from 'expo/fetch';

// Only gateway Cookie lifecycle is serialized. Tokens are supplied by the existing transport.
let cookieMutation: Promise<unknown> = Promise.resolve();
const consumers = new Map<string, number>();
const openedOrigins = new Set<string>();

export function retainMobileWebAppSession(url: string): () => void {
  const origin = new URL(url).origin;
  consumers.set(origin, (consumers.get(origin) || 0) + 1);
  return () => {
    const remaining = (consumers.get(origin) || 1) - 1;
    if (remaining > 0) {
      consumers.set(origin, remaining);
      return;
    }
    consumers.delete(origin);
    cookieMutation = cookieMutation
      .catch(() => undefined)
      .then(async () => {
        // A replacement resident opens a fresh session after this queued cleanup.
        if (consumers.has(origin) || !openedOrigins.delete(origin)) return;
        await fetch(`${origin}/api/mobile-session/logout`, {
          method: 'POST',
          credentials: 'include',
          redirect: 'error',
          signal: AbortSignal.timeout(8_000)
        });
      })
      .catch(() => undefined);
  };
}

export async function openMobileWebAppSession(url: string, headers: Record<string, string>): Promise<number> {
  const origin = new URL(url).origin;
  const task = cookieMutation
    .catch(() => undefined)
    .then(async () => {
      const response = await fetch(`${origin}/api/mobile-session`, {
        method: 'POST',
        headers,
        credentials: 'include',
        redirect: 'error',
        signal: AbortSignal.timeout(8_000)
      });
      if (!response.ok) throw new Error('Mobile WebApp session unavailable');
      const receipt: unknown = await response.json();
      const expiresAt =
        receipt && typeof receipt === 'object' && 'expiresAt' in receipt && typeof receipt.expiresAt === 'string'
          ? Date.parse(receipt.expiresAt)
          : NaN;
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
        throw new Error('Invalid mobile WebApp session expiry');
      openedOrigins.add(origin);
      if (!consumers.has(origin)) {
        openedOrigins.delete(origin);
        await fetch(`${origin}/api/mobile-session/logout`, {
          method: 'POST',
          credentials: 'include',
          redirect: 'error',
          signal: AbortSignal.timeout(8_000)
        });
        throw new Error('Mobile WebApp resident closed');
      }
      return expiresAt;
    });
  cookieMutation = task;
  return task;
}
