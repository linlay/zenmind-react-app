import { createApi } from '@reduxjs/toolkit/query/react';
import { authBaseQuery } from '../../../../core/network/authBaseQuery';
import { AppsCatalog, AppsCatalogPayload, AppsCatalogResponse, AppsAppDefinition } from './types';

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeApp(raw: unknown): AppsAppDefinition {
  const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    key: String(item.key || '').trim(),
    name: String(item.name || '').trim(),
    description: String(item.description || '').trim(),
    effectiveMode: String(item.effectiveMode || '').trim(),
    mountPath: String(item.mountPath || '').trim(),
    apiBase: String(item.apiBase || '').trim(),
    publicMountPath: String(item.publicMountPath || '').trim(),
    publicApiBase: String(item.publicApiBase || '').trim(),
    frontendStatus: String(item.frontendStatus || '').trim(),
    backendStatus: String(item.backendStatus || '').trim(),
    status: String(item.status || '').trim(),
    lastFrontendLoadAt: String(item.lastFrontendLoadAt || '').trim(),
    lastBackendLoadAt: String(item.lastBackendLoadAt || '').trim(),
    lastFrontendError: normalizeNullableString(item.lastFrontendError),
    lastBackendError: normalizeNullableString(item.lastBackendError)
  };
}

function normalizeCatalog(data: unknown): AppsCatalog {
  const payload = data && typeof data === 'object' ? (data as AppsCatalogPayload) : {};
  const apps = Array.isArray(payload.apps) ? payload.apps.map((item) => normalizeApp(item)).filter((item) => item.key) : [];

  return {
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : '',
    apps
  };
}

export const appsApi = createApi({
  reducerPath: 'appsApi',
  baseQuery: authBaseQuery,
  tagTypes: ['Apps'],
  endpoints: (builder) => ({
    getApps: builder.query<AppsCatalog, void>({
      query: () => ({ url: '/ma/__platform/apps' }),
      transformResponse: (data: AppsCatalogResponse) => normalizeCatalog(data),
      providesTags: ['Apps']
    })
  })
});

export const { useGetAppsQuery } = appsApi;
