export type WebAppAccessTarget =
  | {
      kind: 'direct';
      uri: string;
    }
  | {
      kind: 'paired-mobile';
      uri: string;
    };

type MobileHostname = {
  deviceLabel: string;
  domainSuffix: string;
};

function parseUrl(value: unknown, protocols: readonly string[]): URL | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (!protocols.includes(url.protocol) || !url.hostname || url.username || url.password) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function parseMobileHostname(hostname: string): MobileHostname | null {
  const normalizedHostname = hostname.toLowerCase();
  const markerIndex = normalizedHostname.indexOf('.m.');
  if (markerIndex <= 0) {
    return null;
  }

  const deviceLabel = normalizedHostname.slice(0, markerIndex);
  if (!deviceLabel || deviceLabel.includes('.')) {
    return null;
  }

  return {
    deviceLabel,
    domainSuffix: normalizedHostname.slice(markerIndex)
  };
}

function isValidPortLabel(value: string): boolean {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

export function resolveWebAppAccessTarget(webAppUrl: unknown, desktopWsUrl: unknown): WebAppAccessTarget | null {
  const webApp = parseUrl(webAppUrl, ['https:']);
  if (!webApp) {
    return null;
  }

  const mobileWebApp = parseMobileHostname(webApp.hostname);
  if (!mobileWebApp) {
    return {
      kind: 'direct',
      uri: webApp.toString()
    };
  }

  const desktopWs = parseUrl(desktopWsUrl, ['ws:', 'wss:']);
  const mobileDesktop = desktopWs ? parseMobileHostname(desktopWs.hostname) : null;
  if (!mobileDesktop || webApp.port || mobileWebApp.domainSuffix !== mobileDesktop.domainSuffix) {
    return null;
  }

  const expectedPrefix = `${mobileDesktop.deviceLabel}-`;
  if (
    !mobileWebApp.deviceLabel.startsWith(expectedPrefix) ||
    !isValidPortLabel(mobileWebApp.deviceLabel.slice(expectedPrefix.length))
  ) {
    return null;
  }

  return {
    kind: 'paired-mobile',
    uri: webApp.toString()
  };
}

export function addWebAppAccessToken(
  target: Extract<WebAppAccessTarget, { kind: 'paired-mobile' }>,
  accessToken: unknown
): string | null {
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    return null;
  }

  const url = parseUrl(target.uri, ['https:']);
  if (!url || !parseMobileHostname(url.hostname)) {
    return null;
  }

  url.searchParams.set('token', accessToken.trim());
  return url.toString();
}

export function containsWebAppAccessToken(urlValue: unknown): boolean {
  const url = parseUrl(urlValue, ['https:']);
  return Boolean(url && parseMobileHostname(url.hostname) && url.searchParams.has('token'));
}
