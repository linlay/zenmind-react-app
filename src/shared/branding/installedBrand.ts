import { requireOptionalNativeModule } from 'expo-modules-core';

type BrandRegistry = Record<string, unknown>;

type ExpoNativeConstants = {
  manifest?: unknown;
};

type ExpoBrandManifest = {
  extra?: {
    brand?: {
      id?: unknown;
    };
  };
};

const ExponentConstants = requireOptionalNativeModule<ExpoNativeConstants>('ExponentConstants');

function parseManifest(rawManifest: unknown): ExpoBrandManifest | null {
  if (!rawManifest) {
    return null;
  }
  if (typeof rawManifest === 'string') {
    try {
      const parsed = JSON.parse(rawManifest);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ExpoBrandManifest) : null;
    } catch {
      return null;
    }
  }
  return typeof rawManifest === 'object' && !Array.isArray(rawManifest) ? (rawManifest as ExpoBrandManifest) : null;
}

function readEmbeddedBrandId() {
  const manifest = parseManifest(ExponentConstants?.manifest);
  const brandId = manifest?.extra?.brand?.id;
  return typeof brandId === 'string' && brandId.trim() ? brandId.trim().toLowerCase() : null;
}

export function resolveInstalledBrandId<
  TRegistry extends BrandRegistry,
  TDefaultBrandId extends Extract<keyof TRegistry, string>
>(registry: TRegistry, defaultBrandId: TDefaultBrandId) {
  const embeddedBrandId = readEmbeddedBrandId();
  return embeddedBrandId && embeddedBrandId in registry
    ? (embeddedBrandId as Extract<keyof TRegistry, string>)
    : defaultBrandId;
}
