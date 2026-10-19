import { fetch } from 'expo/fetch';
import { File, FileMode } from 'expo-file-system';

import { buildAuthenticatedApiUriSource } from '../apiClient';
import { clearDesktopPlatformCredentialCache } from '../activeWsTransport';
import { getAccountAuthGeneration } from '../../auth/accountAuth';
import { getSelectedSource } from '../../auth/activeDesktop';
import { getCloudAuthSnapshot } from '../../auth/cloudAuth';

// Stream to disk with bounded memory; native downloadFileAsync follows redirects.
export async function downloadAuthenticatedResourceFile(
  resourceUrl: string,
  destination: File,
  options: { signal?: AbortSignal; maxBytes?: number } = {}
): Promise<File> {
  const selection = getSelectedSource();
  const generation = selection?.kind === 'desktop' ? getAccountAuthGeneration() : getCloudAuthSnapshot().generation;
  const assertCurrent = () => {
    if (
      options.signal?.aborted ||
      selection !== getSelectedSource() ||
      generation !== (selection?.kind === 'desktop' ? getAccountAuthGeneration() : getCloudAuthSnapshot().generation)
    )
      throw new Error('Resource download superseded');
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    assertCurrent();
    const source = await buildAuthenticatedApiUriSource(resourceUrl);
    assertCurrent();
    const response = await fetch(source.uri, {
      headers: source.headers,
      signal: options.signal,
      credentials: 'omit',
      redirect: 'error'
    });
    if (response.status === 401 && attempt === 0 && selection?.kind === 'desktop') {
      await response.body?.cancel();
      clearDesktopPlatformCredentialCache();
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Resource stream unavailable');
    let created = false;
    let handle: ReturnType<File['open']> | undefined;
    try {
      const limit = options.maxBytes ?? Infinity;
      if (Number(response.headers.get('content-length')) > limit) throw new Error('Resource too large');
      assertCurrent();
      destination.create({ overwrite: false });
      created = true;
      handle = destination.open(FileMode.WriteOnly);
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        assertCurrent();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) throw new Error('Resource too large');
        handle.writeBytes(chunk.value);
      }
      return destination;
    } catch (error) {
      handle?.close();
      handle = undefined;
      if (created && destination.exists) destination.delete();
      throw error;
    } finally {
      handle?.close();
      await reader.cancel().catch(() => undefined);
    }
  }
  throw new Error('Resource authentication failed');
}
