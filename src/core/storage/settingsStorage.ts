import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types/common';
import {
  getDefaultEndpointInput,
  normalizeEndpointInput,
  normalizePtyUrlInput,
  toDefaultPtyWebUrl
} from '../network/endpoint';

const LEGACY_STORAGE_KEY = 'agw_mobile_chat_settings_v1';
const STORAGE_KEY = 'agw_mobile_app_settings_v2';

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
  const endpointInput = normalizeEndpointInput(raw?.endpointInput || defaults.endpointInput);
  const ptyUrlInput = normalizePtyUrlInput(raw?.ptyUrlInput || '', endpointInput);

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
