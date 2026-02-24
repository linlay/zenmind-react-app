import * as Application from 'expo-application';
import Constants from 'expo-constants';

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getAppVersionLabel(): string {
  const version =
    toNonEmptyString(Application.nativeApplicationVersion) ??
    toNonEmptyString(Constants.expoConfig?.version) ??
    '0.0.0';

  const build =
    toNonEmptyString(Application.nativeBuildVersion) ??
    toNonEmptyString(Constants.expoConfig?.android?.versionCode) ??
    toNonEmptyString(Constants.expoConfig?.ios?.buildNumber) ??
    'dev';

  return `v${version} (${build})`;
}
