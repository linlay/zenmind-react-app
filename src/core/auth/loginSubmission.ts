import { normalizeEndpointInput, toBackendBaseUrl, toDefaultPtyWebUrl } from '../network/endpoint';

export interface LoginSubmissionInput {
  endpointDraft: string;
  masterPassword: string;
  deviceName: string;
}

export interface LoginSubmissionResolution {
  ok: boolean;
  error?: string;
  normalizedEndpoint?: string;
  backendUrl?: string;
  ptyUrl?: string;
  password?: string;
  deviceName?: string;
}

export function resolveLoginSubmission(input: LoginSubmissionInput): LoginSubmissionResolution {
  const normalizedEndpoint = normalizeEndpointInput(input.endpointDraft);
  if (!normalizedEndpoint) {
    return {
      ok: false,
      error: '请输入后端域名或 IP'
    };
  }

  const password = String(input.masterPassword || '').trim();
  if (!password) {
    return {
      ok: false,
      error: '请输入主密码'
    };
  }

  const backendUrl = toBackendBaseUrl(normalizedEndpoint);
  if (!backendUrl) {
    return {
      ok: false,
      error: '后端地址格式无效'
    };
  }

  return {
    ok: true,
    normalizedEndpoint,
    backendUrl,
    ptyUrl: toDefaultPtyWebUrl(normalizedEndpoint),
    password,
    deviceName: String(input.deviceName || '').trim()
  };
}
