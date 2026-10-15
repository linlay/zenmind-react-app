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

function parseDesktopHostname(hostname: string): MobileHostname | null {
  const dot = hostname.indexOf('.');
  if (dot <= 0 || dot === hostname.length - 1) return null;
  return { deviceLabel: hostname.slice(0, dot).toLowerCase(), domainSuffix: hostname.slice(dot).toLowerCase() };
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

  const desktopWs = parseUrl(desktopWsUrl, ['ws:', 'wss:']);
  const desktop = desktopWs ? parseDesktopHostname(desktopWs.hostname) : null;
  if (!desktop) return null;
  if (!webApp.hostname.toLowerCase().endsWith(desktop.domainSuffix)) return { kind: 'direct', uri: webApp.toString() };
  const prefix = `${desktop.deviceLabel}-`;
  const label = webApp.hostname.slice(0, -desktop.domainSuffix.length).toLowerCase();
  if (
    webApp.port ||
    webApp.searchParams.has('token') ||
    !label.startsWith(prefix) ||
    !isValidPortLabel(label.slice(prefix.length))
  )
    return null;
  return {
    kind: 'paired-mobile',
    uri: webApp.toString()
  };
}
