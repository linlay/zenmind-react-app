import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types/common';
import {
  DEFAULT_REMOTE_ENDPOINT_INPUT,
  getDefaultEndpointInput,
  normalizeEndpointInput,
  normalizePtyUrlInput,
  toDefaultPtyWebUrl
} from '../network/endpoint';

const LEGACY_STORAGE_KEY = 'mobile_chat_settings_v1';
const STORAGE_KEY = 'mobile_app_settings_v2';
const LEGACY_LOCAL_ENDPOINTS = new Set([
  'localhost:11946',
  'http://localhost:11946',
  'localhost:8080',
  'http://localhost:8080'
]);
const LEGACY_LOCAL_PTY_URLS = new Set(['http://localhost:11949', 'localhost:11949']);

export { STORAGE_KEY, LEGACY_STORAGE_KEY };

export function buildDefaultSettings(): AppSettings {
  const defaultEndpointInput = getDefaultEndpointInput();
  return {
    themeMode: 'light',
    endpointInput: defaultEndpointInput,
    ptyUrlInput: toDefaultPtyWebUrl(defaultEndpointInput),
    selectedAgentKey: '',
    activeDomain: 'chat'
  };
}

function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const defaults = buildDefaultSettings();
  const rawEndpointInput = String(raw?.endpointInput || '').trim().replace(/\/+$/, '');
  const shouldUpgradeLegacyLocalEndpoint =
    defaults.endpointInput === DEFAULT_REMOTE_ENDPOINT_INPUT &&
    LEGACY_LOCAL_ENDPOINTS.has(rawEndpointInput);
  const endpointInput = normalizeEndpointInput(
    shouldUpgradeLegacyLocalEndpoint ? defaults.endpointInput : raw?.endpointInput || defaults.endpointInput
  );

  const rawPtyUrlInput = String(raw?.ptyUrlInput || '').trim().replace(/\/+$/, '');
  const shouldRegeneratePtyUrl =
    shouldUpgradeLegacyLocalEndpoint && (!rawPtyUrlInput || LEGACY_LOCAL_PTY_URLS.has(rawPtyUrlInput));
  const ptyUrlInput = normalizePtyUrlInput(shouldRegeneratePtyUrl ? '' : raw?.ptyUrlInput || '', endpointInput);

  return {
    themeMode: raw?.themeMode === 'dark' ? 'dark' : 'light',
    endpointInput,
    ptyUrlInput,
    selectedAgentKey: String(raw?.selectedAgentKey || ''),
    activeDomain:
      raw?.activeDomain === 'terminal' || raw?.activeDomain === 'agents' || raw?.activeDomain === 'user'
        ? raw.activeDomain
        : 'chat'
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const defaults = buildDefaultSettings();

  try {
    const [currentRaw, legacyRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(LEGACY_STORAGE_KEY)
    ]);

    if (currentRaw) {
      return normalizeSettings(JSON.parse(currentRaw));
    }

    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Partial<AppSettings>;
      const migrated = normalizeSettings(legacy);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    return defaults;
  }

  return defaults;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}

export async function patchSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next = normalizeSettings({ ...current, ...partial });
  await saveSettings(next);
  return next;
}
