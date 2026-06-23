export const MASTER_PASSWORD_LOGIN_PATH = '/api/auth/login';
export const PAIRING_CLAIM_PATH = '/api/auth/pairing/claim';

export type MasterPasswordLoginRequest = {
  path: typeof MASTER_PASSWORD_LOGIN_PATH;
  deviceName: string;
  body: {
    masterPassword: string;
    deviceName: string;
  };
};

export type PairingClaimRequest = {
  path: typeof PAIRING_CLAIM_PATH;
  deviceName: string;
  body: {
    pairingId: string;
    secret: string;
    deviceName: string;
  };
};

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function resolveDeviceName(deviceName: string, fallbackDeviceName: string): string {
  return normalizeText(deviceName) || normalizeText(fallbackDeviceName) || 'RN Device';
}

export function buildMasterPasswordLoginRequest(
  masterPassword: string,
  deviceName: string,
  fallbackDeviceName: string
): MasterPasswordLoginRequest {
  const normalizedPassword = normalizeText(masterPassword);
  if (!normalizedPassword) {
    throw new Error('请输入主密码');
  }

  const normalizedDeviceName = resolveDeviceName(deviceName, fallbackDeviceName);
  return {
    path: MASTER_PASSWORD_LOGIN_PATH,
    deviceName: normalizedDeviceName,
    body: {
      masterPassword: normalizedPassword,
      deviceName: normalizedDeviceName,
    },
  };
}

export function buildPairingClaimRequest(
  pairingId: string,
  secret: string,
  deviceName: string,
  fallbackDeviceName: string
): PairingClaimRequest {
  const normalizedDeviceName = resolveDeviceName(deviceName, fallbackDeviceName);
  return {
    path: PAIRING_CLAIM_PATH,
    deviceName: normalizedDeviceName,
    body: {
      pairingId: normalizeText(pairingId),
      secret: normalizeText(secret),
      deviceName: normalizedDeviceName,
    },
  };
}
