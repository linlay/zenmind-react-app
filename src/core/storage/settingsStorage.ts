import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types/common';
import {
  getDefaultEndpointInput,
  normalizeEndpointInput,
  normalizePtyUrlInput,
  toDefaultPtyWebUrl
} from '../network/endpoint';

const LEGACY_STORAGE_KEY = 'mobile_chat_settings_v1';
const PREVIOUS_STORAGE_KEY = 'mobile_app_settings_v2';
const STORAGE_KEY = 'mobile_app_settings_v3';
const LEGACY_DEVICE_TOKEN_KEY = 'app_device_token_v1';
const LEGACY_LOCAL_PTY_URLS = new Set(['http://localhost:11949', 'localhost:11949']);

export { STORAGE_KEY, LEGACY_STORAGE_KEY, PREVIOUS_STORAGE_KEY };

let legacyStoragePurged = false;

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
  const endpointInput = normalizeEndpointInput(raw?.endpointInput || defaults.endpointInput);
  const rawPtyUrlInput = String(raw?.ptyUrlInput || '').trim().replace(/\/+$/, '');
  const shouldRegeneratePtyUrl = !rawPtyUrlInput || LEGACY_LOCAL_PTY_URLS.has(rawPtyUrlInput);
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
    if (!legacyStoragePurged) {
      legacyStoragePurged = true;
      await Promise.allSettled([
        AsyncStorage.removeItem(PREVIOUS_STORAGE_KEY),
        AsyncStorage.removeItem(LEGACY_STORAGE_KEY),
        AsyncStorage.removeItem(LEGACY_DEVICE_TOKEN_KEY)
      ]);
    }

    const currentRaw = await AsyncStorage.getItem(STORAGE_KEY);

    if (currentRaw) {
      return normalizeSettings(JSON.parse(currentRaw));
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
