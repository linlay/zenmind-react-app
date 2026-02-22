interface BuildPtyWebUrlOptions {
  openNewSessionNonce?: number;
}

export function resolveTerminalSessionsBaseUrl(ptyWebUrl: string): string {
  const url = new URL(String(ptyWebUrl || '').trim());
  url.pathname = '/appterm/api';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

export function buildPtyWebUrlWithSessionId(
  ptyWebUrl: string,
  sessionId: string,
  options: BuildPtyWebUrlOptions = {}
): string {
  try {
    const url = new URL(String(ptyWebUrl || '').trim());
    const normalizedSessionId = String(sessionId || '').trim();
    const normalizedOpenNonce = Number.isFinite(options.openNewSessionNonce) ? Number(options.openNewSessionNonce) : 0;
    if (normalizedSessionId) {
      url.searchParams.set('sessionId', normalizedSessionId);
    } else {
      url.searchParams.delete('sessionId');
    }
    if (normalizedOpenNonce > 0) {
      url.searchParams.set('openNewSession', '1');
      url.searchParams.set('openNonce', String(normalizedOpenNonce));
    } else {
      url.searchParams.delete('openNewSession');
      url.searchParams.delete('openNonce');
    }
    return url.toString();
  } catch {
    return String(ptyWebUrl || '').trim();
  }
}
