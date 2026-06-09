import { chatSyncService } from '../../features/chatRealtime/chatSyncService';

export async function clearSettingsLocalCache(restartRealtime: boolean) {
  await chatSyncService.resetLocalCacheForDevelopment();

  if (restartRealtime) {
    void chatSyncService.start().catch(() => {});
  }
}
