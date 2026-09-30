import { getActiveDeviceProfile } from '../../core/auth/deviceProfiles';
import { getAccountAuthSnapshot } from '../../core/auth/accountAuth.ts';
import { readActiveDesktopId } from '../../core/auth/activeDesktop.ts';
import { getDefaultSourceConfig } from '../../core/config/appEnvironment';
import { createChatSource, type ChatSource } from './chatSource';

export function getDefaultChatSource(): ChatSource {
  const config = getDefaultSourceConfig();
  return createChatSource('default', config.sourceId, config.displayName);
}

export function getPairedChatSource(): ChatSource | null {
  const accountSession = getAccountAuthSnapshot().session;
  const accountDesktopId = accountSession ? readActiveDesktopId(accountSession.accountId) : '';
  if (accountDesktopId) {
    return createChatSource('paired', accountDesktopId, 'Desktop');
  }
  const profile = getActiveDeviceProfile();
  if (profile?.transportKind !== 'desktop-ws' || profile.needsRelink || !profile.desktopWs) {
    return null;
  }
  return createChatSource('paired', profile.desktopDeviceId, profile.displayName || 'Desktop');
}

export function isAccountDesktopChatSource(source: ChatSource): boolean {
  const session = getAccountAuthSnapshot().session;
  return Boolean(session && source.kind === 'paired' && readActiveDesktopId(session.accountId) === source.sourceId);
}
