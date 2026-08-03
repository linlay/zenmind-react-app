import { getActiveDeviceProfile } from '../../core/auth/deviceProfiles';
import { getDefaultSourceConfig } from '../../core/config/appEnvironment';
import { createChatSource, type ChatSource } from './chatSource';

export function getDefaultChatSource(): ChatSource {
  const config = getDefaultSourceConfig();
  return createChatSource('default', config.sourceId, config.displayName);
}

export function getPairedChatSource(): ChatSource | null {
  const profile = getActiveDeviceProfile();
  if (
    profile?.transportKind !== 'desktop-ws' ||
    profile.needsRelink ||
    !profile.desktopWs
  ) {
    return null;
  }
  return createChatSource(
    'paired',
    profile.desktopDeviceId,
    profile.displayName || 'Desktop'
  );
}
