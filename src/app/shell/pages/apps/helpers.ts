import { toBackendBaseUrl } from '../../../../core/network/endpoint';
import { AppsAppDefinition } from './types';

export function getAppByKey(apps: AppsAppDefinition[], appKey?: string | null): AppsAppDefinition | null {
  const normalizedKey = String(appKey || '').trim();
  if (!normalizedKey) {
    return null;
  }
  return apps.find((item) => item.key === normalizedKey) || null;
}

export function getAppStatusLabel(status?: string | null): string {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'active') return '可用';
  if (normalized === 'inactive') return '停用';
  if (normalized === 'error' || normalized === 'failed') return '异常';
  if (normalized === 'pending' || normalized === 'starting' || normalized === 'building') return '准备中';

  return String(status || '').trim() || '未知';
}

function normalizeRelativePath(path: string): string {
  const trimmed = String(path || '').trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function resolveAppWebViewUrl(app: AppsAppDefinition | null, endpointInput?: string | null): string {
  if (!app) {
    return '';
  }

  const preferredPath = normalizeRelativePath(app.publicMountPath) || normalizeRelativePath(app.mountPath);
  if (!preferredPath) {
    return '';
  }
  if (/^https?:\/\//i.test(preferredPath)) {
    return preferredPath;
  }

  const backendBaseUrl = toBackendBaseUrl(endpointInput);
  if (!backendBaseUrl) {
    return '';
  }

  try {
    return new URL(preferredPath, `${backendBaseUrl.replace(/\/+$/, '')}/`).toString();
  } catch {
    return '';
  }
}
