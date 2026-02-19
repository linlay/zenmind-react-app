import { ChatEvent } from '../types/chat';

export function parseSseBlock(block: string, onJsonEvent: (event: ChatEvent) => void): void {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return;
  }

  const payload = dataLines.join('\n').trim();
  if (!payload || payload === '[DONE]') {
    return;
  }

  try {
    const parsed = JSON.parse(payload) as ChatEvent;
    if (parsed && typeof parsed === 'object') {
      onJsonEvent(parsed);
    }
  } catch {
    // Ignore malformed frame
  }
}

export function consumeJsonSseXhr(
  url: string,
  fetchOptions: RequestInit,
  onJsonEvent: (event: ChatEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('request aborted'));
      return;
    }

    const xhr = new XMLHttpRequest();
    let lastIndex = 0;
    let settled = false;

    const settle = (fn: (value?: unknown) => void, value?: unknown) => {
      if (!settled) {
        settled = true;
        fn(value);
      }
    };

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort);
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.open((fetchOptions.method as string) || 'POST', url);

    if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
      Object.entries(fetchOptions.headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, String(value));
      });
    }

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 3) {
        const full = xhr.responseText;
        const fresh = full.substring(lastIndex);
        if (fresh) {
          const parts = fresh.split(/\r?\n\r?\n/);
          const incomplete = parts.pop() || '';
          for (const chunk of parts) {
            if (chunk.trim()) {
              parseSseBlock(chunk, onJsonEvent);
            }
          }
          lastIndex = full.length - incomplete.length;
        }
      }

      if (xhr.readyState === 4) {
        const remain = xhr.responseText.substring(lastIndex).trim();
        if (remain) {
          parseSseBlock(remain, onJsonEvent);
        }

        cleanup();
        if (xhr.status >= 200 && xhr.status < 300) {
          settle(resolve);
        } else {
          settle(reject, new Error(`HTTP ${xhr.status}: ${xhr.responseText.slice(0, 220)}`));
        }
      }
    };

    xhr.onerror = () => {
      cleanup();
      settle(reject, new Error('Network request failed'));
    };

    xhr.onabort = () => {
      cleanup();
      settle(reject, new Error('request aborted'));
    };

    xhr.send((fetchOptions.body as Document | XMLHttpRequestBodyInit | null | undefined) || null);
  });
}
