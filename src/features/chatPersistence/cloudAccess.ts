import { createDefaultWsTransportConfig } from '../../core/api/activeWsTransport.ts';
import { readChatDirectory, classifyCloudFailure } from '../../core/api/services/chatDirectoryApi.ts';
import {
  beginCloudVerification,
  createCloudCredential,
  finishCloudVerification,
  getCloudAuthSnapshot,
  readCloudCredential,
  type CloudStatus
} from '../../core/auth/cloudAuth.ts';
import { sharedWsTransport } from '../../core/ws/sharedWsTransport.ts';

let pending: { controller: AbortController; promise: Promise<CloudStatus> } | null = null;
export function cancelCloudVerification(): void {
  pending?.controller.abort();
}
export function verifyDefaultCloud(token?: string, signal?: AbortSignal): Promise<CloudStatus> {
  if (token === undefined && pending && !pending.controller.signal.aborted) return pending.promise;
  pending?.controller.abort();
  if (token !== undefined && (!token.trim() || token.length > 8192 || /[\r\n\u0000]/u.test(token)))
    return Promise.resolve('login_required');
  const candidate = token === undefined ? readCloudCredential() : createCloudCredential(token.trim(), true);
  const previous = getCloudAuthSnapshot();
  const previousCredential = readCloudCredential();
  const generation = beginCloudVerification();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const config = candidate ? createDefaultWsTransportConfig(candidate) : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, 15_000);
  const task = (async (): Promise<CloudStatus> => {
    let status: CloudStatus = 'login_required';
    try {
      if (config) {
        await readChatDirectory(config, controller.signal);
        status = 'available';
      }
    } catch (error) {
      status = classifyCloudFailure(error);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    const cancelled = controller.signal.aborted && !timedOut;
    controller.abort(); // Cancel sibling reads after any failure.
    if (generation !== getCloudAuthSnapshot().generation) return 'network_error';
    if (cancelled) {
      finishCloudVerification(previousCredential, previous.status, generation);
      return 'network_error';
    }
    if (status !== 'available' && token !== undefined && candidate?.scopeId !== previousCredential?.scopeId)
      finishCloudVerification(previousCredential, previous.status, generation);
    else finishCloudVerification(candidate, status, generation);
    return status;
  })().finally(() => {
    if (pending?.promise === task) pending = null;
    if (config) sharedWsTransport.releaseIfIdle(config);
  });
  pending = { controller, promise: task };
  return task;
}
