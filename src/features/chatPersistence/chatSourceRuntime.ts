import { getAccountAuthSnapshot } from '../../core/auth/accountAuth.ts';
import { readActiveDesktopId, getSelectedSource } from '../../core/auth/activeDesktop.ts';
import { getCloudAuthSnapshot } from '../../core/auth/cloudAuth';
import { getDefaultSourceConfig } from '../../core/config/appEnvironment';
import { createChatSource, type ChatSource } from './chatSource';

export function getDefaultChatSource(): ChatSource {
  const config = getDefaultSourceConfig();
  return createChatSource(
    'default',
    JSON.stringify([config.sourceId, getCloudAuthSnapshot().scopeId]),
    config.displayName
  );
}

export function getPairedChatSource(): ChatSource | null {
  const accountSession = getAccountAuthSnapshot().session;
  const accountDesktopId = accountSession ? readActiveDesktopId(accountSession.accountId) : '';
  if (accountDesktopId) {
    return createChatSource('paired', JSON.stringify([accountSession!.accountId, accountDesktopId]), 'Desktop');
  }
  return null;
}

export function isAccountDesktopChatSource(source: ChatSource): boolean {
  const session = getAccountAuthSnapshot().session;
  return Boolean(session && source.kind === 'paired' && source.key === getPairedChatSource()?.key);
}

export function getActiveChatSource(): ChatSource | null {
  const selected = getSelectedSource();
  if (selected?.kind === 'cloud') return getCloudAuthSnapshot().cacheAllowed ? getDefaultChatSource() : null;
  return selected?.kind === 'desktop' ? getPairedChatSource() : null;
}
