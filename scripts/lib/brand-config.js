const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const DEFAULT_BRAND_ID = 'zenmind';
const SUPPORTED_LOCALES = ['zh-CN', 'en-US'];

const BRAND_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;
const EXPO_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const NATIVE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]+$/u;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/u;

const SHARED_BRAND_CONFIG = 'brands/shared.json';
const BRAND_ASSET_ROOT = 'assets/brands';
const GENERATED_BRAND_TS = 'src/shared/generated/brand.ts';
const GENERATED_BRAND_ASSETS_TS = 'src/shared/generated/brandAssets.ts';
const GENERATED_ASSET_MANIFEST_NAME = 'manifest.json';
const ACTIVE_NATIVE_MANIFEST = '.generated/brand/native-active-manifest.json';
const BRAND_ASSET_GENERATOR_VERSION = 8;
const ICON_LOGO_SCALE = 0.76;
const ADAPTIVE_ICON_LOGO_SCALE = 0.5;
const FAVICON_LOGO_SCALE = 0.72;
const ANDROID_SPLASH_SAFE_AREA_SCALE = 0.8;
const ANDROID_SPLASH_DENSITIES = [
  { directory: 'drawable-mdpi', multiplier: 1 },
  { directory: 'drawable-hdpi', multiplier: 1.5 },
  { directory: 'drawable-xhdpi', multiplier: 2 },
  { directory: 'drawable-xxhdpi', multiplier: 3 },
  { directory: 'drawable-xxxhdpi', multiplier: 4 }
];
const ANDROID_LAUNCHER_DENSITIES = [
  { directory: 'mipmap-mdpi', multiplier: 1, iconSize: 48, foregroundSize: 108 },
  { directory: 'mipmap-hdpi', multiplier: 1.5, iconSize: 72, foregroundSize: 162 },
  { directory: 'mipmap-xhdpi', multiplier: 2, iconSize: 96, foregroundSize: 216 },
  { directory: 'mipmap-xxhdpi', multiplier: 3, iconSize: 144, foregroundSize: 324 },
  { directory: 'mipmap-xxxhdpi', multiplier: 4, iconSize: 192, foregroundSize: 432 }
];
const IOS_SPLASH_SCALES = [
  { filename: 'image.png', ratio: 1 },
  { filename: 'image@2x.png', ratio: 2 },
  { filename: 'image@3x.png', ratio: 3 }
];

function normalizeBrandId(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!BRAND_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid brand id: ${value}`);
  }
  return normalized;
}

function resolveBrandIdFromArgv(argv, options = {}) {
  const allowPositional = options.allowPositional !== false;
  let positionalBrandId = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--brand') {
      if (!argv[index + 1]) {
        throw new Error('Missing value for --brand.');
      }
      return normalizeBrandId(argv[index + 1]);
    }
    if (arg.startsWith('--brand=')) {
      return normalizeBrandId(arg.slice('--brand='.length));
    }
    if (allowPositional && !arg.startsWith('-') && positionalBrandId === null) {
      positionalBrandId = arg;
    }
  }
  return positionalBrandId === null ? null : normalizeBrandId(positionalBrandId);
}

function resolveBrandId(argv = process.argv.slice(2), env = process.env, rootDir = process.cwd(), options = {}) {
  const argvBrandId = resolveBrandIdFromArgv(argv, options);
  if (argvBrandId) {
    return argvBrandId;
  }
  if (env.BRAND) {
    return normalizeBrandId(env.BRAND);
  }
  return DEFAULT_BRAND_ID;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read JSON ${filePath}: ${message}`);
  }
}

function requireString(manifest, key) {
  const value = manifest[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Brand manifest field "${key}" must be a non-empty string.`);
  }
  return value.trim();
}

function requireNestedString(manifest, group, key) {
  const value = manifest[group]?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Brand manifest field "${group}.${key}" must be a non-empty string.`);
  }
  return value.trim();
}

function requireHexColor(manifest, group, key) {
  const value = requireNestedString(manifest, group, key);
  if (!HEX_COLOR_PATTERN.test(value)) {
    throw new Error(`Brand manifest field "${group}.${key}" must be a #RRGGBB color.`);
  }
  return value.toUpperCase();
}

function validateNativeId(label, value) {
  if (!NATIVE_ID_PATTERN.test(value) || !value.includes('.')) {
    throw new Error(`Brand manifest field "${label}" is invalid: ${value}`);
  }
  return value;
}

function validateSlug(value) {
  if (!EXPO_SLUG_PATTERN.test(value)) {
    throw new Error(`Brand manifest field "slug" is invalid: ${value}`);
  }
  return value;
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function repoRelative(rootDir, absolutePath) {
  return toPosixPath(path.relative(rootDir, absolutePath));
}

function loadBrandI18n(rootDir, brandRoot, manifest) {
  const value = manifest.i18n;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Brand manifest field "i18n" must map locales to JSON files.');
  }

  const result = {};
  for (const locale of SUPPORTED_LOCALES) {
    const relativePath = value[locale];
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      throw new Error(`Brand manifest field "i18n.${locale}" must be a JSON file path.`);
    }

    const filePath = path.join(brandRoot, relativePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Brand i18n file not found: ${repoRelative(rootDir, filePath)}`);
    }

    const parsed = readJson(filePath);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Brand i18n file must contain an object: ${repoRelative(rootDir, filePath)}`);
    }
    result[locale] = parsed;
  }
  return result;
}

function sharedBrandConfigPath(rootDir) {
  return path.join(rootDir, SHARED_BRAND_CONFIG);
}

function normalizeSharedBrandConfig(config) {
  const storageNamespace = validateSlug(requireString(config, 'storageNamespace'));
  const androidPackage = validateNativeId(
    'nativeIdentity.androidPackage',
    requireNestedString(config, 'nativeIdentity', 'androidPackage')
  );
  const bundleIdentifier = validateNativeId(
    'nativeIdentity.iosBundleIdentifier',
    requireNestedString(config, 'nativeIdentity', 'iosBundleIdentifier')
  );
  const updatesProjectId = requireNestedString(config, 'updates', 'projectId');
  const updatesProjectSlug = validateSlug(requireNestedString(config, 'updates', 'projectSlug'));
  const updatesUrl = requireNestedString(config, 'updates', 'url');

  return {
    storageNamespace,
    androidPackage,
    bundleIdentifier,
    updates: {
      projectId: updatesProjectId,
      projectSlug: updatesProjectSlug,
      url: updatesUrl
    }
  };
}

function loadSharedBrandConfig(rootDir = process.cwd()) {
  const configPath = sharedBrandConfigPath(rootDir);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Shared brand config not found: ${repoRelative(rootDir, configPath)}`);
  }
  return normalizeSharedBrandConfig(readJson(configPath));
}

function optionalBrandAssetPath(rootDir, brandRoot, manifest, key) {
  const value = manifest[key];
  if (value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Brand manifest field "${key}" must be a non-empty relative file path.`);
  }

  const assetPath = path.resolve(brandRoot, value.trim());
  const relativeToBrand = path.relative(brandRoot, assetPath);
  if (relativeToBrand.startsWith('..') || path.isAbsolute(relativeToBrand)) {
    throw new Error(`Brand manifest field "${key}" must stay inside ${repoRelative(rootDir, brandRoot)}.`);
  }
  return repoRelative(rootDir, assetPath);
}

function normalizeManifest(rootDir, brandRoot, manifest, sharedConfig, i18n, appVersion) {
  const id = requireString(manifest, 'id').toLowerCase();
  if (!BRAND_ID_PATTERN.test(id)) {
    throw new Error(`Brand manifest field "id" is invalid: ${id}`);
  }
  if (id !== path.basename(brandRoot)) {
    throw new Error(`Brand manifest id "${id}" must match directory "${path.basename(brandRoot)}".`);
  }

  const productName = requireString(manifest, 'productName');
  const expoName = requireString(manifest, 'expoName');
  const notificationChannel = requireNestedString(manifest, 'notification', 'channel');
  const splashImageWidth = Number(manifest.splash?.imageWidth);
  if (!Number.isFinite(splashImageWidth) || splashImageWidth <= 0) {
    throw new Error('Brand manifest field "splash.imageWidth" must be a positive number.');
  }
  const androidSplashImageWidth = Math.round(
    splashImageWidth * ANDROID_SPLASH_SAFE_AREA_SCALE
  );

  const brandAssetRoot = `${BRAND_ASSET_ROOT}/${id}`;
  const generatedAssets = {
    icon: `${brandAssetRoot}/icon.png`,
    adaptiveIcon: `${brandAssetRoot}/adaptive-icon.png`,
    logo: `${brandAssetRoot}/logo.png`,
    favicon: `${brandAssetRoot}/favicon.png`
  };

  return {
    id,
    productName,
    expoName,
    slug: sharedConfig.updates.projectSlug,
    version: appVersion,
    storageNamespace: sharedConfig.storageNamespace,
    android: {
      package: sharedConfig.androidPackage,
      adaptiveIconBackgroundColor: requireHexColor(manifest, 'android', 'adaptiveIconBackgroundColor')
    },
    ios: {
      bundleIdentifier: sharedConfig.bundleIdentifier
    },
    updates: sharedConfig.updates,
    splash: {
      backgroundColor: requireHexColor(manifest, 'splash', 'backgroundColor'),
      imageWidth: splashImageWidth,
      androidImageWidth: androidSplashImageWidth
    },
    notification: {
      channel: notificationChannel,
      color: requireHexColor(manifest, 'notification', 'color')
    },
    visual: {
      backgroundColor: requireHexColor(manifest, 'visual', 'backgroundColor'),
      backgroundColorEnd: requireHexColor(manifest, 'visual', 'backgroundColorEnd'),
      primaryColor: requireHexColor(manifest, 'visual', 'primaryColor'),
      secondaryColor: requireHexColor(manifest, 'visual', 'secondaryColor')
    },
    i18n,
    generatedAssets,
    source: {
      brandRoot: repoRelative(rootDir, brandRoot),
      appIcon: optionalBrandAssetPath(rootDir, brandRoot, manifest, 'appIcon')
    }
  };
}

function loadBrandConfig(
  rootDir = process.cwd(),
  brandId = resolveBrandId(process.argv.slice(2), process.env, rootDir),
  appVersion = readPackageVersion(rootDir),
  sharedConfig = loadSharedBrandConfig(rootDir)
) {
  const id = normalizeBrandId(brandId);
  const brandRoot = path.join(rootDir, 'brands', id);
  const manifestPath = path.join(brandRoot, 'brand.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Brand manifest not found: ${repoRelative(rootDir, manifestPath)}`);
  }

  const manifest = readJson(manifestPath);
  const i18n = loadBrandI18n(rootDir, brandRoot, manifest);
  return normalizeManifest(rootDir, brandRoot, manifest, sharedConfig, i18n, appVersion);
}

function loadAllBrandConfigs(rootDir, appVersion) {
  const sharedConfig = loadSharedBrandConfig(rootDir);
  const brandsRoot = path.join(rootDir, 'brands');
  return fs
    .readdirSync(brandsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(brandsRoot, entry.name, 'brand.json')))
    .map((entry) => loadBrandConfig(rootDir, entry.name, appVersion, sharedConfig))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readPackageVersion(rootDir) {
  return readJson(path.join(rootDir, 'package.json')).version || '0.0.0';
}

function writeFileIfChanged(filePath, content) {
  const next = Buffer.isBuffer(content) ? content : Buffer.from(String(content));
  if (fs.existsSync(filePath) && Buffer.compare(fs.readFileSync(filePath), next) === 0) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
  return true;
}

function runtimeBrandPayload(brand) {
  return {
    id: brand.id,
    productName: brand.productName,
    expoName: brand.expoName,
    slug: brand.slug,
    version: brand.version,
    storageNamespace: brand.storageNamespace,
    splash: {
      backgroundColor: brand.splash.backgroundColor,
      imageWidth: brand.splash.imageWidth
    },
    i18n: brand.i18n
  };
}

function brandRegistryPayload(brands) {
  return Object.fromEntries(brands.map((brand) => [brand.id, runtimeBrandPayload(brand)]));
}

function generatedBrandLogoImport(rootDir, brandAssetsTsPath, brand) {
  const logoPath = path.join(rootDir, brand.generatedAssets.logo);
  const logoImportPath = toPosixPath(path.relative(path.dirname(brandAssetsTsPath), logoPath));
  return logoImportPath.startsWith('.') ? logoImportPath : `./${logoImportPath}`;
}

function generatedBrandLogoSymbol(brandId) {
  return `brandLogo_${brandId.replace(/[^A-Za-z0-9_$]/gu, '_')}`;
}

function writeGeneratedBrandFiles(rootDir, brands) {
  const registryPayload = brandRegistryPayload(brands);
  const brandTsPath = path.join(rootDir, GENERATED_BRAND_TS);
  const brandTsContent = [
    "import { resolveInstalledBrandId } from '../branding/installedBrand';",
    '',
    `export const DEFAULT_BRAND_ID = ${JSON.stringify(DEFAULT_BRAND_ID)} as const;`,
    '',
    `export const APP_BRANDS = ${JSON.stringify(registryPayload, null, 2)} as const;`,
    '',
    'export type AppBrandId = keyof typeof APP_BRANDS;',
    '',
    'export const INSTALLED_BRAND_ID = resolveInstalledBrandId(APP_BRANDS, DEFAULT_BRAND_ID);',
    'export const APP_BRAND = APP_BRANDS[INSTALLED_BRAND_ID];',
    '',
    'export const BRAND_ID = APP_BRAND.id;',
    'export const PRODUCT_NAME = APP_BRAND.productName;',
    'export const EXPO_NAME = APP_BRAND.expoName;',
    'export const APP_SLUG = APP_BRAND.slug;',
    'export const APP_VERSION = APP_BRAND.version;',
    'export const STORAGE_NAMESPACE = APP_BRAND.storageNamespace;',
    'export const BRAND_SPLASH_BACKGROUND_COLOR = APP_BRAND.splash.backgroundColor;',
    'export const BRAND_SPLASH_IMAGE_WIDTH = APP_BRAND.splash.imageWidth;',
    ''
  ].join('\n');
  writeFileIfChanged(brandTsPath, brandTsContent);

  const brandAssetsTsPath = path.join(rootDir, GENERATED_BRAND_ASSETS_TS);
  const logoImports = brands.map((brand) => ({
    brand,
    symbol: generatedBrandLogoSymbol(brand.id),
    importPath: generatedBrandLogoImport(rootDir, brandAssetsTsPath, brand)
  }));
  const brandAssetsTsContent = [
    ...logoImports.map(({ symbol, importPath }) => `import ${symbol} from '${importPath}';`),
    '',
    "import { DEFAULT_BRAND_ID, INSTALLED_BRAND_ID, type AppBrandId } from './brand';",
    '',
    'export const BRAND_LOGOS = {',
    ...logoImports.map(({ brand, symbol }) => `  ${JSON.stringify(brand.id)}: ${symbol},`),
    '} as const;',
    '',
    'export const BRAND_LOGO = BRAND_LOGOS[INSTALLED_BRAND_ID] || BRAND_LOGOS[DEFAULT_BRAND_ID];',
    '',
    'export function getBrandLogo(brandId: AppBrandId) {',
    '  return BRAND_LOGOS[brandId] || BRAND_LOGOS[DEFAULT_BRAND_ID];',
    '}',
    ''
  ].join('\n');
  writeFileIfChanged(brandAssetsTsPath, brandAssetsTsContent);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashStableJson(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function brandRuntimeFingerprint(brands) {
  return hashStableJson({
    brands: brandRegistryPayload(brands)
  });
}

function brandLogoPath(rootDir, brand) {
  return path.join(rootDir, brand.generatedAssets.logo);
}

function readRequiredLogoSource(rootDir, brand) {
  const logoPath = brandLogoPath(rootDir, brand);
  if (!fs.existsSync(logoPath)) {
    throw new Error(`Brand logo source not found: ${repoRelative(rootDir, logoPath)}`);
  }

  const bytes = fs.readFileSync(logoPath);
  return {
    bytes,
    hash: crypto.createHash('sha256').update(bytes).digest('hex'),
    path: logoPath
  };
}

function readOptionalAppIconSource(rootDir, brand) {
  if (!brand.source.appIcon) {
    return null;
  }

  const appIconPath = path.join(rootDir, brand.source.appIcon);
  if (!fs.existsSync(appIconPath)) {
    throw new Error(`Brand app icon source not found: ${repoRelative(rootDir, appIconPath)}`);
  }

  const bytes = fs.readFileSync(appIconPath);
  return {
    bytes,
    hash: crypto.createHash('sha256').update(bytes).digest('hex'),
    path: appIconPath
  };
}

function brandAssetFingerprint(brand, logoHash, appIconHash) {
  return hashStableJson({
    appIcon: appIconHash,
    assetGenerator: BRAND_ASSET_GENERATOR_VERSION,
    logo: logoHash,
    visual: brand.visual
  });
}

function brandNativeSplashImageFingerprint(brand, logoHash) {
  return hashStableJson({
    androidSplashImageWidth: brand.splash.androidImageWidth,
    assetGenerator: BRAND_ASSET_GENERATOR_VERSION,
    logo: logoHash,
    splashImageWidth: brand.splash.imageWidth
  });
}

function brandNativeLauncherImageFingerprint(brand, logoHash, appIconHash) {
  return hashStableJson({
    adaptiveIconBackgroundColor: brand.android.adaptiveIconBackgroundColor,
    appIcon: appIconHash,
    assetGenerator: BRAND_ASSET_GENERATOR_VERSION,
    logo: logoHash,
    visual: brand.visual
  });
}

function brandNativeTextFingerprint(brand) {
  return hashStableJson({
    android: brand.android,
    assetGenerator: BRAND_ASSET_GENERATOR_VERSION,
    brandId: brand.id,
    expoName: brand.expoName,
    ios: brand.ios,
    notification: brand.notification,
    productName: brand.productName,
    splashBackgroundColor: brand.splash.backgroundColor,
    updates: brand.updates,
    version: brand.version
  });
}

function generatedManifestPath(rootDir, brand) {
  return path.join(path.dirname(path.join(rootDir, brand.generatedAssets.icon)), GENERATED_ASSET_MANIFEST_NAME);
}

function activeNativeManifestPath(rootDir) {
  return path.join(rootDir, ACTIVE_NATIVE_MANIFEST);
}

function readGeneratedManifest(rootDir, brand) {
  const manifestPath = generatedManifestPath(rootDir, brand);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return readJson(manifestPath);
  } catch {
    return null;
  }
}

function readActiveNativeManifest(rootDir) {
  const manifestPath = activeNativeManifestPath(rootDir);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return readJson(manifestPath);
  } catch {
    return null;
  }
}

function generatedDerivedAssetFilesExist(rootDir, brand) {
  return [brand.generatedAssets.icon, brand.generatedAssets.adaptiveIcon, brand.generatedAssets.favicon].every(
    (relativePath) => fs.existsSync(path.join(rootDir, relativePath))
  );
}

function areGeneratedAssetsCurrent(manifest, rootDir, brand, assetFingerprint) {
  return manifest?.assetFingerprint === assetFingerprint && generatedDerivedAssetFilesExist(rootDir, brand);
}

function androidProjectExists(rootDir) {
  const androidMainPath = path.join(rootDir, 'android', 'app', 'src', 'main');
  return fs.existsSync(androidMainPath);
}

function iosProjectExists(rootDir) {
  return fs.existsSync(path.join(rootDir, 'ios'));
}

function iosAppAssetCatalogDirectories(rootDir) {
  const iosRoot = path.join(rootDir, 'ios');
  if (!iosProjectExists(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(iosRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(iosRoot, entry.name, 'Images.xcassets'))
    .filter((assetCatalogPath) => fs.existsSync(assetCatalogPath));
}

function iosProjectFilePaths(rootDir) {
  const iosRoot = path.join(rootDir, 'ios');
  if (!iosProjectExists(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(iosRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.xcodeproj'))
    .map((entry) => path.join(iosRoot, entry.name, 'project.pbxproj'))
    .filter((projectPath) => fs.existsSync(projectPath));
}

function iosInfoPlistPaths(rootDir) {
  return iosAppAssetCatalogDirectories(rootDir)
    .map((assetCatalogPath) => path.join(path.dirname(assetCatalogPath), 'Info.plist'))
    .filter((plistPath) => fs.existsSync(plistPath));
}

function nativeProjectExists(rootDir) {
  return androidProjectExists(rootDir) || iosProjectExists(rootDir);
}

function androidSplashImageFilesExist(rootDir) {
  const androidMainPath = path.join(rootDir, 'android', 'app', 'src', 'main');
  if (!androidProjectExists(rootDir)) {
    return true;
  }

  return ANDROID_SPLASH_DENSITIES.every((density) =>
    fs.existsSync(path.join(androidMainPath, 'res', density.directory, 'splashscreen_logo.png'))
  );
}

function androidLauncherImageFilesExist(rootDir) {
  const androidMainPath = path.join(rootDir, 'android', 'app', 'src', 'main');
  if (!androidProjectExists(rootDir)) {
    return true;
  }

  return ANDROID_LAUNCHER_DENSITIES.every((density) =>
    ['ic_launcher.webp', 'ic_launcher_round.webp', 'ic_launcher_foreground.webp'].every((filename) =>
      fs.existsSync(path.join(androidMainPath, 'res', density.directory, filename))
    )
  );
}

function androidTextFilesExist(rootDir) {
  if (!androidProjectExists(rootDir)) {
    return true;
  }

  return [
    'android/app/build.gradle',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/res/values/colors.xml',
    'android/app/src/main/res/values/strings.xml'
  ].every((relativePath) => fs.existsSync(path.join(rootDir, relativePath)));
}

function iosSplashImageFilesExist(rootDir) {
  if (!iosProjectExists(rootDir)) {
    return true;
  }

  const assetCatalogDirectories = iosAppAssetCatalogDirectories(rootDir);
  if (assetCatalogDirectories.length === 0) {
    return true;
  }

  for (const assetCatalogPath of assetCatalogDirectories) {
    const imageSetPath = path.join(assetCatalogPath, 'SplashScreenLogo.imageset');
    if (
      fs.existsSync(imageSetPath) &&
      !IOS_SPLASH_SCALES.every((scale) => fs.existsSync(path.join(imageSetPath, scale.filename)))
    ) {
      return false;
    }
  }

  return true;
}

function iosAppIconFilesExist(rootDir) {
  if (!iosProjectExists(rootDir)) {
    return true;
  }

  const assetCatalogDirectories = iosAppAssetCatalogDirectories(rootDir);
  if (assetCatalogDirectories.length === 0) {
    return true;
  }

  for (const assetCatalogPath of assetCatalogDirectories) {
    const appIconSetPath = path.join(assetCatalogPath, 'AppIcon.appiconset');
    const contentsPath = path.join(appIconSetPath, 'Contents.json');
    if (!fs.existsSync(contentsPath)) {
      continue;
    }

    const contents = readJson(contentsPath);
    const images = Array.isArray(contents.images) ? contents.images : [];
    const filenames = images.map((image) => image?.filename).filter((filename) => typeof filename === 'string');
    if (filenames.length > 0 && !filenames.every((filename) => fs.existsSync(path.join(appIconSetPath, filename)))) {
      return false;
    }
  }

  return true;
}

function iosSplashBackgroundFilesExist(rootDir) {
  if (!iosProjectExists(rootDir)) {
    return true;
  }

  const assetCatalogDirectories = iosAppAssetCatalogDirectories(rootDir);
  if (assetCatalogDirectories.length === 0) {
    return true;
  }

  for (const assetCatalogPath of assetCatalogDirectories) {
    const splashLogoPath = path.join(assetCatalogPath, 'SplashScreenLogo.imageset');
    const backgroundPath = path.join(assetCatalogPath, 'SplashScreenBackground.colorset', 'Contents.json');
    if (fs.existsSync(splashLogoPath) && !fs.existsSync(backgroundPath)) {
      return false;
    }
  }

  return true;
}

function iosTextFilesExist(rootDir) {
  if (!iosProjectExists(rootDir)) {
    return true;
  }

  const hasAppProject = iosAppAssetCatalogDirectories(rootDir).length > 0;
  if (!hasAppProject) {
    return true;
  }

  return iosProjectFilePaths(rootDir).length > 0 && iosInfoPlistPaths(rootDir).length > 0;
}

function nativeSplashImageFilesExist(rootDir) {
  return androidSplashImageFilesExist(rootDir) && iosSplashImageFilesExist(rootDir);
}

function nativeLauncherImageFilesExist(rootDir) {
  return androidLauncherImageFilesExist(rootDir) && iosAppIconFilesExist(rootDir);
}

function nativeTextFilesExist(rootDir) {
  return androidTextFilesExist(rootDir) && iosSplashBackgroundFilesExist(rootDir) && iosTextFilesExist(rootDir);
}

function isActiveNativeManifestForBrand(manifest, brand) {
  return manifest?.brandId === brand.id && manifest?.assetGeneratorVersion === BRAND_ASSET_GENERATOR_VERSION;
}

function areNativeSplashImagesCurrent(manifest, rootDir, brand, nativeSplashImageFingerprint) {
  return (
    isActiveNativeManifestForBrand(manifest, brand) &&
    manifest?.nativeSplashImageFingerprint === nativeSplashImageFingerprint &&
    nativeSplashImageFilesExist(rootDir)
  );
}

function areNativeLauncherImagesCurrent(manifest, rootDir, brand, nativeLauncherImageFingerprint) {
  return (
    isActiveNativeManifestForBrand(manifest, brand) &&
    manifest?.nativeLauncherImageFingerprint === nativeLauncherImageFingerprint &&
    nativeLauncherImageFilesExist(rootDir)
  );
}

function areNativeTextsCurrent(manifest, rootDir, brand, nativeTextFingerprint) {
  return (
    isActiveNativeManifestForBrand(manifest, brand) &&
    manifest?.nativeTextFingerprint === nativeTextFingerprint &&
    nativeTextFilesExist(rootDir)
  );
}

function writeGeneratedManifest(rootDir, brand, fingerprints) {
  writeFileIfChanged(
    generatedManifestPath(rootDir, brand),
    `${JSON.stringify(
      {
        version: 1,
        brandId: brand.id,
        appVersion: brand.version,
        runtimeFingerprint: fingerprints.runtime,
        assetFingerprint: fingerprints.asset,
        assetGeneratorVersion: BRAND_ASSET_GENERATOR_VERSION,
        assets: brand.generatedAssets
      },
      null,
      2
    )}\n`
  );
}

function writeActiveNativeManifest(rootDir, brand, fingerprints) {
  writeFileIfChanged(
    activeNativeManifestPath(rootDir),
    `${JSON.stringify(
      {
        version: 1,
        brandId: brand.id,
        appVersion: brand.version,
        nativeSplashImageFingerprint: fingerprints.nativeSplashImage,
        nativeLauncherImageFingerprint: fingerprints.nativeLauncherImage,
        nativeTextFingerprint: fingerprints.nativeText,
        assetGeneratorVersion: BRAND_ASSET_GENERATOR_VERSION,
        activeBrandId: brand.id,
        androidPackage: brand.android.package,
        iosBundleIdentifier: brand.ios.bundleIdentifier
      },
      null,
      2
    )}\n`
  );
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
    a: 255
  };
}

function mixColor(left, right, amount) {
  return {
    r: Math.round(left.r + (right.r - left.r) * amount),
    g: Math.round(left.g + (right.g - left.g) * amount),
    b: Math.round(left.b + (right.b - left.b) * amount),
    a: Math.round(left.a + (right.a - left.a) * amount)
  };
}

function createPng(size, height = size) {
  return {
    width: size,
    height,
    data: Buffer.alloc(size * height * 4)
  };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function encodePng(png) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(png.width, 0);
  header.writeUInt32BE(png.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const bytesPerRow = png.width * 4;
  const raw = Buffer.alloc((bytesPerRow + 1) * png.height);
  for (let y = 0; y < png.height; y += 1) {
    const rawOffset = y * (bytesPerRow + 1);
    raw[rawOffset] = 0;
    png.data.copy(raw, rawOffset + 1, y * bytesPerRow, (y + 1) * bytesPerRow);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND')
  ]);
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) {
    return up;
  }
  return upLeft;
}

function pngChannelCount(colorType) {
  switch (colorType) {
    case 0:
      return 1;
    case 2:
      return 3;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      throw new Error(`Unsupported PNG color type: ${colorType}`);
  }
}

function decodePng(buffer, filePath) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid PNG signature: ${repoRelative(process.cwd(), filePath)}`);
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlaceMethod = data[12];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8 || interlaceMethod !== 0) {
    throw new Error(`Unsupported PNG format: ${repoRelative(process.cwd(), filePath)}`);
  }

  const channelCount = pngChannelCount(colorType);
  const bytesPerScanline = width * channelCount;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const png = createPng(width, height);
  let inflatedOffset = 0;
  let previousScanline = Buffer.alloc(bytesPerScanline);

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[inflatedOffset];
    inflatedOffset += 1;
    const currentScanline = Buffer.alloc(bytesPerScanline);

    for (let index = 0; index < bytesPerScanline; index += 1) {
      const raw = inflated[inflatedOffset];
      inflatedOffset += 1;
      const left = index >= channelCount ? currentScanline[index - channelCount] : 0;
      const up = previousScanline[index] ?? 0;
      const upLeft = index >= channelCount ? previousScanline[index - channelCount] : 0;
      let value = raw;

      if (filterType === 1) {
        value = raw + left;
      } else if (filterType === 2) {
        value = raw + up;
      } else if (filterType === 3) {
        value = raw + Math.floor((left + up) / 2);
      } else if (filterType === 4) {
        value = raw + paethPredictor(left, up, upLeft);
      } else if (filterType !== 0) {
        throw new Error(`Unsupported PNG filter ${filterType}: ${repoRelative(process.cwd(), filePath)}`);
      }

      currentScanline[index] = value & 0xff;
    }

    for (let x = 0; x < width; x += 1) {
      const sourceOffset = x * channelCount;
      const targetOffset = pixelOffset(png, x, y);
      if (colorType === 6) {
        png.data[targetOffset] = currentScanline[sourceOffset];
        png.data[targetOffset + 1] = currentScanline[sourceOffset + 1];
        png.data[targetOffset + 2] = currentScanline[sourceOffset + 2];
        png.data[targetOffset + 3] = currentScanline[sourceOffset + 3];
      } else if (colorType === 2) {
        png.data[targetOffset] = currentScanline[sourceOffset];
        png.data[targetOffset + 1] = currentScanline[sourceOffset + 1];
        png.data[targetOffset + 2] = currentScanline[sourceOffset + 2];
        png.data[targetOffset + 3] = 255;
      } else if (colorType === 4) {
        png.data[targetOffset] = currentScanline[sourceOffset];
        png.data[targetOffset + 1] = currentScanline[sourceOffset];
        png.data[targetOffset + 2] = currentScanline[sourceOffset];
        png.data[targetOffset + 3] = currentScanline[sourceOffset + 1];
      } else if (colorType === 0) {
        png.data[targetOffset] = currentScanline[sourceOffset];
        png.data[targetOffset + 1] = currentScanline[sourceOffset];
        png.data[targetOffset + 2] = currentScanline[sourceOffset];
        png.data[targetOffset + 3] = 255;
      }
    }

    previousScanline = currentScanline;
  }

  return png;
}

function pixelOffset(png, x, y) {
  return (png.width * y + x) << 2;
}

function setPixel(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return;
  }

  const offset = pixelOffset(png, x, y);
  const srcA = Math.max(0, Math.min(1, (color.a ?? 255) / 255));
  const dstA = png.data[offset + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    png.data[offset] = 0;
    png.data[offset + 1] = 0;
    png.data[offset + 2] = 0;
    png.data[offset + 3] = 0;
    return;
  }

  png.data[offset] = Math.round((color.r * srcA + png.data[offset] * dstA * (1 - srcA)) / outA);
  png.data[offset + 1] = Math.round((color.g * srcA + png.data[offset + 1] * dstA * (1 - srcA)) / outA);
  png.data[offset + 2] = Math.round((color.b * srcA + png.data[offset + 2] * dstA * (1 - srcA)) / outA);
  png.data[offset + 3] = Math.round(outA * 255);
}

function fillGradient(png, topColor, bottomColor) {
  for (let y = 0; y < png.height; y += 1) {
    const amount = y / Math.max(1, png.height - 1);
    const color = mixColor(topColor, bottomColor, amount);
    for (let x = 0; x < png.width; x += 1) {
      const offset = pixelOffset(png, x, y);
      png.data[offset] = color.r;
      png.data[offset + 1] = color.g;
      png.data[offset + 2] = color.b;
      png.data[offset + 3] = 255;
    }
  }
}

function findOpaqueBounds(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[pixelOffset(png, x, y) + 3];
      if (alpha <= 8) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: png.width, height: png.height };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function samplePngBilinear(png, x, y) {
  const clampedX = Math.max(0, Math.min(png.width - 1, x));
  const clampedY = Math.max(0, Math.min(png.height - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(png.width - 1, x0 + 1);
  const y1 = Math.min(png.height - 1, y0 + 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const result = [0, 0, 0, 0];

  for (const [sampleX, sampleY, weight] of [
    [x0, y0, (1 - tx) * (1 - ty)],
    [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty],
    [x1, y1, tx * ty]
  ]) {
    const offset = pixelOffset(png, sampleX, sampleY);
    result[0] += png.data[offset] * weight;
    result[1] += png.data[offset + 1] * weight;
    result[2] += png.data[offset + 2] * weight;
    result[3] += png.data[offset + 3] * weight;
  }

  return {
    r: Math.round(result[0]),
    g: Math.round(result[1]),
    b: Math.round(result[2]),
    a: Math.round(result[3])
  };
}

function drawPngFit(target, source, maxWidth, maxHeight = maxWidth, { trimTransparent = false } = {}) {
  const bounds = trimTransparent
    ? findOpaqueBounds(source)
    : { x: 0, y: 0, width: source.width, height: source.height };
  const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));
  const left = Math.round((target.width - width) / 2);
  const top = Math.round((target.height - height) / 2);

  for (let y = 0; y < height; y += 1) {
    const sourceY = bounds.y + ((y + 0.5) / height) * bounds.height - 0.5;
    for (let x = 0; x < width; x += 1) {
      const sourceX = bounds.x + ((x + 0.5) / width) * bounds.width - 0.5;
      setPixel(target, left + x, top + y, samplePngBilinear(source, sourceX, sourceY));
    }
  }
}

function drawCircle(png, cx, cy, radius, color) {
  const x0 = Math.floor(cx - radius);
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius);
  const y1 = Math.ceil(cy + radius);
  const rr = radius * radius;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rr) {
        setPixel(png, x, y, color);
      }
    }
  }
}

function drawGlow(png, cx, cy, radius, color, strength) {
  const x0 = Math.floor(cx - radius);
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius);
  const y1 = Math.ceil(cy + radius);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > radius) {
        continue;
      }
      const alpha = Math.round((1 - distance / radius) ** 2 * strength);
      if (alpha > 0) {
        setPixel(png, x, y, { ...color, a: alpha });
      }
    }
  }
}

function createPalette(brand) {
  return {
    background: hexToRgb(brand.visual.backgroundColor),
    backgroundEnd: hexToRgb(brand.visual.backgroundColorEnd),
    primary: hexToRgb(brand.visual.primaryColor),
    secondary: hexToRgb(brand.visual.secondaryColor)
  };
}

function createLogoIconPng(brand, logo, size, scale) {
  const png = createPng(size);
  const palette = createPalette(brand);
  fillGradient(png, palette.background, palette.backgroundEnd);
  drawGlow(png, size * 0.5, size * 0.38, size * 0.42, palette.secondary, 54);
  drawGlow(png, size * 0.18, size * 0.85, size * 0.32, palette.primary, 34);
  drawPngFit(png, logo, size * scale, size * scale, { trimTransparent: true });
  return encodePng(png);
}

function createLogoForegroundPng(logo, size, scale) {
  const png = createPng(size);
  drawPngFit(png, logo, size * scale, size * scale, { trimTransparent: true });
  return encodePng(png);
}

function createFullBleedAppIconPng(appIcon, size) {
  const png = createPng(size);
  drawPngFit(png, appIcon, size, size);
  return encodePng(png);
}

function createLauncherIconPng(brand, logo, appIcon, size) {
  return appIcon
    ? createFullBleedAppIconPng(appIcon, size)
    : createLogoIconPng(brand, logo, size, ICON_LOGO_SCALE);
}

function createAdaptiveIconPng(logo, appIcon, size) {
  return appIcon
    ? createFullBleedAppIconPng(appIcon, size)
    : createLogoForegroundPng(logo, size, ADAPTIVE_ICON_LOGO_SCALE);
}

function createLogoSplashPng(logo, canvasSize, imageSize) {
  const png = createPng(canvasSize);
  drawPngFit(png, logo, imageSize, imageSize);
  return encodePng(png);
}

function writeGeneratedAssets(rootDir, brand, logo, appIcon) {
  const assetRoot = path.dirname(path.join(rootDir, brand.generatedAssets.icon));
  const icon = createLauncherIconPng(brand, logo, appIcon, 1024);
  const adaptiveIcon = createAdaptiveIconPng(logo, appIcon, 1024);
  const favicon = createLogoIconPng(brand, logo, 64, FAVICON_LOGO_SCALE);
  writeFileIfChanged(path.join(assetRoot, 'icon.png'), icon);
  writeFileIfChanged(path.join(assetRoot, 'adaptive-icon.png'), adaptiveIcon);
  writeFileIfChanged(path.join(assetRoot, 'favicon.png'), favicon);
}

function writeAndroidSplashImageResources(rootDir, brand, logo) {
  const androidMainPath = path.join(rootDir, 'android', 'app', 'src', 'main');
  if (!fs.existsSync(androidMainPath)) {
    return;
  }

  for (const density of ANDROID_SPLASH_DENSITIES) {
    const canvasSize = Math.round(288 * density.multiplier);
    const imageSize = Math.round(brand.splash.androidImageWidth * density.multiplier);
    writeFileIfChanged(
      path.join(androidMainPath, 'res', density.directory, 'splashscreen_logo.png'),
      createLogoSplashPng(logo, canvasSize, imageSize)
    );
  }
}

function writeAndroidAdaptiveIconXml(filePath) {
  writeFileIfChanged(
    filePath,
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
      '    <background android:drawable="@color/iconBackground"/>',
      '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>',
      '</adaptive-icon>'
    ].join('\n')
  );
}

function writeAndroidLauncherImageResources(rootDir, brand, logo, appIcon) {
  const androidMainPath = path.join(rootDir, 'android', 'app', 'src', 'main');
  if (!fs.existsSync(androidMainPath)) {
    return;
  }

  // Expo prebuild currently emits PNG payloads under .webp launcher names; keep the resource names stable.
  for (const density of ANDROID_LAUNCHER_DENSITIES) {
    const directory = path.join(androidMainPath, 'res', density.directory);
    writeFileIfChanged(
      path.join(directory, 'ic_launcher.webp'),
      createLauncherIconPng(brand, logo, appIcon, density.iconSize)
    );
    writeFileIfChanged(
      path.join(directory, 'ic_launcher_round.webp'),
      createLauncherIconPng(brand, logo, appIcon, density.iconSize)
    );
    writeFileIfChanged(
      path.join(directory, 'ic_launcher_foreground.webp'),
      createAdaptiveIconPng(logo, appIcon, density.foregroundSize)
    );
  }

  const adaptiveIconRoot = path.join(androidMainPath, 'res', 'mipmap-anydpi-v26');
  writeAndroidAdaptiveIconXml(path.join(adaptiveIconRoot, 'ic_launcher.xml'));
  writeAndroidAdaptiveIconXml(path.join(adaptiveIconRoot, 'ic_launcher_round.xml'));
}

function iosImageScale(scale) {
  if (typeof scale !== 'string') {
    return 1;
  }
  const value = Number(scale.replace(/x$/u, ''));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function iosIconPixelSize(image) {
  if (typeof image?.size === 'string') {
    const [width] = image.size.split('x');
    const size = Number(width) * iosImageScale(image.scale);
    if (Number.isFinite(size) && size > 0) {
      return Math.round(size);
    }
  }

  const filenameMatch = typeof image?.filename === 'string' ? image.filename.match(/(\d+)x\1/u) : null;
  if (filenameMatch) {
    return Number(filenameMatch[1]);
  }
  return 1024;
}

function writeIosAppIconResources(rootDir, brand, logo, appIcon) {
  for (const assetCatalogPath of iosAppAssetCatalogDirectories(rootDir)) {
    const appIconSetPath = path.join(assetCatalogPath, 'AppIcon.appiconset');
    const contentsPath = path.join(appIconSetPath, 'Contents.json');
    if (!fs.existsSync(contentsPath)) {
      continue;
    }

    const contents = readJson(contentsPath);
    const images = Array.isArray(contents.images) ? contents.images : [];
    for (const image of images) {
      if (typeof image?.filename !== 'string') {
        continue;
      }
      writeFileIfChanged(
        path.join(appIconSetPath, image.filename),
        createLauncherIconPng(brand, logo, appIcon, iosIconPixelSize(image))
      );
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function replaceResourceValue(contents, tagName, resourceName, value, filePath) {
  const escapedName = escapeRegExp(resourceName);
  const pattern = new RegExp(`(<${tagName}\\s+name="${escapedName}"[^>]*>)[^<]*(</${tagName}>)`, 'u');
  if (pattern.test(contents)) {
    return contents.replace(pattern, `$1${value}$2`);
  }
  if (/<\/resources>/u.test(contents)) {
    return contents.replace(
      /<\/resources>/u,
      `  <${tagName} name="${resourceName}">${value}</${tagName}>\n</resources>`
    );
  }
  throw new Error(`Failed to update Android resource ${resourceName}: missing </resources> in ${filePath}`);
}

function removeResourceValue(contents, tagName, resourceName) {
  const escapedName = escapeRegExp(resourceName);
  const pattern = new RegExp(`\\n\\s*<${tagName}\\s+name="${escapedName}"[^>]*>[^<]*</${tagName}>`, 'u');
  return contents.replace(pattern, '');
}

function writeAndroidColorResources(rootDir, brand) {
  const colorsPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'colors.xml');
  if (!fs.existsSync(colorsPath)) {
    return;
  }

  let colors = fs.readFileSync(colorsPath, 'utf8');
  colors = replaceResourceValue(colors, 'color', 'splashscreen_background', brand.splash.backgroundColor, colorsPath);
  colors = replaceResourceValue(
    colors,
    'color',
    'iconBackground',
    brand.android.adaptiveIconBackgroundColor,
    colorsPath
  );
  colors = replaceResourceValue(colors, 'color', 'notification_icon_color', brand.notification.color, colorsPath);
  writeFileIfChanged(colorsPath, colors);
}

function writeAndroidStringResources(rootDir, brand) {
  const stringsPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  if (!fs.existsSync(stringsPath)) {
    return;
  }

  let strings = fs.readFileSync(stringsPath, 'utf8');
  strings = removeResourceValue(strings, 'string', 'brand_id');
  strings = replaceResourceValue(strings, 'string', 'app_name', escapeXmlText(brand.productName), stringsPath);
  strings = replaceResourceValue(strings, 'string', 'expo_runtime_version', escapeXmlText(brand.version), stringsPath);
  writeFileIfChanged(stringsPath, strings);
}

function xmlAttributePattern(attributeName) {
  return new RegExp(`\\s${escapeRegExp(attributeName)}="[^"]*"`, 'u');
}

function xmlAttributeEquals(tag, attributeName, value) {
  const pattern = new RegExp(`\\s${escapeRegExp(attributeName)}="${escapeRegExp(value)}"`, 'u');
  return pattern.test(tag);
}

function replaceXmlAttribute(tag, attributeName, value) {
  const escapedValue = escapeXmlText(value);
  const pattern = xmlAttributePattern(attributeName);
  if (pattern.test(tag)) {
    return tag.replace(pattern, ` ${attributeName}="${escapedValue}"`);
  }
  return tag.replace(/\s*\/?>$/u, (ending) => ` ${attributeName}="${escapedValue}"${ending}`);
}

function replaceAndroidManifestMetaValue(contents, name, value, filePath) {
  const tagPattern = /<meta-data\b[^>]*>/gu;
  for (const match of contents.matchAll(tagPattern)) {
    const tag = match[0];
    if (!xmlAttributeEquals(tag, 'android:name', name)) {
      continue;
    }

    const nextTag = replaceXmlAttribute(tag, 'android:value', value);
    return `${contents.slice(0, match.index)}${nextTag}${contents.slice(match.index + tag.length)}`;
  }

  throw new Error(`Failed to update AndroidManifest meta-data "${name}" in ${filePath}`);
}

function writeAndroidManifestBrandValues(rootDir, brand) {
  const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  let manifest = fs.readFileSync(manifestPath, 'utf8');
  manifest = replaceAndroidManifestMetaValue(
    manifest,
    'com.google.firebase.messaging.default_notification_channel_id',
    brand.notification.channel,
    manifestPath
  );
  manifest = replaceAndroidManifestMetaValue(
    manifest,
    'expo.modules.updates.EXPO_UPDATE_URL',
    brand.updates.url,
    manifestPath
  );
  writeFileIfChanged(manifestPath, manifest);
}

function replaceGradleValue(contents, key, value, filePath) {
  const pattern = new RegExp(`(\\b${escapeRegExp(key)}\\b\\s*(?:=\\s*)?['"])[^'"]+(['"])`, 'u');
  if (!pattern.test(contents)) {
    throw new Error(`Failed to update Gradle value "${key}" in ${filePath}`);
  }
  return contents.replace(pattern, `$1${value}$2`);
}

function writeAndroidGradleBrandValues(rootDir, brand) {
  const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(gradlePath)) {
    return;
  }

  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = replaceGradleValue(gradle, 'applicationId', brand.android.package, gradlePath);
  gradle = replaceGradleValue(gradle, 'versionName', brand.version, gradlePath);
  writeFileIfChanged(gradlePath, gradle);
}

function writeAndroidTextResources(rootDir, brand) {
  if (!androidProjectExists(rootDir)) {
    return;
  }

  writeAndroidColorResources(rootDir, brand);
  writeAndroidStringResources(rootDir, brand);
  writeAndroidManifestBrandValues(rootDir, brand);
  writeAndroidGradleBrandValues(rootDir, brand);
}

function decimalColorComponent(value) {
  return (value / 255).toFixed(15);
}

function splashBackgroundContents(backgroundColor) {
  const color = hexToRgb(backgroundColor);
  return {
    colors: [
      {
        color: {
          components: {
            alpha: '1.000',
            blue: decimalColorComponent(color.b),
            green: decimalColorComponent(color.g),
            red: decimalColorComponent(color.r)
          },
          'color-space': 'srgb'
        },
        idiom: 'universal'
      }
    ],
    info: {
      version: 1,
      author: 'expo'
    }
  };
}

function writeIosSplashImageResources(rootDir, brand, logo) {
  for (const assetCatalogPath of iosAppAssetCatalogDirectories(rootDir)) {
    const imageSetPath = path.join(assetCatalogPath, 'SplashScreenLogo.imageset');
    if (!fs.existsSync(imageSetPath)) {
      continue;
    }

    for (const scale of IOS_SPLASH_SCALES) {
      const imageSize = Math.round(brand.splash.imageWidth * scale.ratio);
      writeFileIfChanged(path.join(imageSetPath, scale.filename), createLogoSplashPng(logo, imageSize, imageSize));
    }
  }
}

function writeIosSplashBackgroundResources(rootDir, brand) {
  for (const assetCatalogPath of iosAppAssetCatalogDirectories(rootDir)) {
    const splashLogoPath = path.join(assetCatalogPath, 'SplashScreenLogo.imageset');
    const backgroundPath = path.join(assetCatalogPath, 'SplashScreenBackground.colorset', 'Contents.json');
    if (fs.existsSync(splashLogoPath) && !fs.existsSync(backgroundPath)) {
      throw new Error(`Failed to update iOS splash background: missing ${backgroundPath}`);
    }
    if (fs.existsSync(backgroundPath)) {
      writeFileIfChanged(
        backgroundPath,
        `${JSON.stringify(splashBackgroundContents(brand.splash.backgroundColor), null, 2)}\n`
      );
    }
  }
}

function escapePbxValue(value) {
  const raw = String(value);
  if (/^[A-Za-z0-9_.-]+$/u.test(raw)) {
    return raw;
  }
  return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function replacePbxBuildSetting(contents, key, value, filePath) {
  const pattern = new RegExp(`(\\b${escapeRegExp(key)}\\b\\s*=\\s*)[^;]+(;)$`, 'gmu');
  let didReplace = false;
  const next = contents.replace(pattern, (_match, prefix, suffix) => {
    didReplace = true;
    return `${prefix}${escapePbxValue(value)}${suffix}`;
  });
  if (!didReplace) {
    throw new Error(`Failed to update Xcode build setting "${key}" in ${filePath}`);
  }
  return next;
}

function writeIosProjectBrandValues(rootDir, brand) {
  for (const projectPath of iosProjectFilePaths(rootDir)) {
    let project = fs.readFileSync(projectPath, 'utf8');
    project = replacePbxBuildSetting(project, 'PRODUCT_BUNDLE_IDENTIFIER', brand.ios.bundleIdentifier, projectPath);
    project = replacePbxBuildSetting(project, 'PRODUCT_NAME', brand.productName, projectPath);
    project = replacePbxBuildSetting(project, 'MARKETING_VERSION', brand.version, projectPath);
    writeFileIfChanged(projectPath, project);
  }
}

function replacePlistStringValue(contents, key, value, filePath) {
  const pattern = new RegExp(`(<key>${escapeRegExp(key)}</key>\\s*<string>)[^<]*(</string>)`, 'u');
  if (!pattern.test(contents)) {
    throw new Error(`Failed to update Info.plist key "${key}" in ${filePath}`);
  }
  return contents.replace(pattern, `$1${escapeXmlText(value)}$2`);
}

function removePlistStringValue(contents, key) {
  const pattern = new RegExp(`\\n\\s*<key>${escapeRegExp(key)}</key>\\s*\\n\\s*<string>[^<]*</string>`, 'u');
  return contents.replace(pattern, '');
}

function replacePlistUrlScheme(contents, value, filePath) {
  const pattern = /(<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>)[^<]*(<\/string>)/u;
  if (!pattern.test(contents)) {
    throw new Error(`Failed to update Info.plist CFBundleURLSchemes in ${filePath}`);
  }
  return contents.replace(pattern, `$1${escapeXmlText(value)}$2`);
}

function writeIosInfoPlistBrandValues(rootDir, brand) {
  for (const plistPath of iosInfoPlistPaths(rootDir)) {
    let plist = fs.readFileSync(plistPath, 'utf8');
    plist = removePlistStringValue(plist, 'AppBrandId');
    plist = replacePlistStringValue(plist, 'CFBundleDisplayName', brand.productName, plistPath);
    plist = replacePlistStringValue(plist, 'CFBundleShortVersionString', brand.version, plistPath);
    plist = replacePlistUrlScheme(plist, brand.ios.bundleIdentifier, plistPath);
    writeFileIfChanged(plistPath, plist);
  }
}

function writeIosTextResources(rootDir, brand) {
  if (!iosProjectExists(rootDir)) {
    return;
  }
  if (iosAppAssetCatalogDirectories(rootDir).length > 0) {
    if (iosProjectFilePaths(rootDir).length === 0) {
      throw new Error(`Failed to update iOS brand values: missing .xcodeproj in ${path.join(rootDir, 'ios')}`);
    }
    if (iosInfoPlistPaths(rootDir).length === 0) {
      throw new Error(`Failed to update iOS brand values: missing Info.plist beside app asset catalog`);
    }
  }

  writeIosProjectBrandValues(rootDir, brand);
  writeIosInfoPlistBrandValues(rootDir, brand);
}

function writeNativeSplashImageResources(rootDir, brand, logo) {
  writeAndroidSplashImageResources(rootDir, brand, logo);
  writeIosSplashImageResources(rootDir, brand, logo);
}

function writeNativeLauncherImageResources(rootDir, brand, logo, appIcon) {
  writeAndroidLauncherImageResources(rootDir, brand, logo, appIcon);
  writeIosAppIconResources(rootDir, brand, logo, appIcon);
}

function writeNativeTextResources(rootDir, brand) {
  writeAndroidTextResources(rootDir, brand);
  writeIosSplashBackgroundResources(rootDir, brand);
  writeIosTextResources(rootDir, brand);
}

function syncBrandArtifacts({
  rootDir = process.cwd(),
  brandId = resolveBrandId(process.argv.slice(2), process.env, rootDir),
  appVersion = readPackageVersion(rootDir),
  force = false,
  syncNativeProject = true
} = {}) {
  const brand = loadBrandConfig(rootDir, brandId, appVersion);
  const brands = loadAllBrandConfigs(rootDir, appVersion);
  const logoSource = readRequiredLogoSource(rootDir, brand);
  const appIconSource = readOptionalAppIconSource(rootDir, brand);
  const fingerprints = {
    runtime: brandRuntimeFingerprint(brands),
    asset: brandAssetFingerprint(brand, logoSource.hash, appIconSource?.hash ?? null),
    nativeSplashImage: brandNativeSplashImageFingerprint(brand, logoSource.hash),
    nativeLauncherImage: brandNativeLauncherImageFingerprint(
      brand,
      logoSource.hash,
      appIconSource?.hash ?? null
    ),
    nativeText: brandNativeTextFingerprint(brand)
  };
  const manifest = readGeneratedManifest(rootDir, brand);
  const activeNativeManifest = readActiveNativeManifest(rootDir);
  const shouldSyncNativeProject = syncNativeProject && nativeProjectExists(rootDir);
  writeGeneratedBrandFiles(rootDir, brands);
  const shouldWriteGeneratedAssets = force || !areGeneratedAssetsCurrent(manifest, rootDir, brand, fingerprints.asset);
  const shouldWriteNativeSplashImages = shouldSyncNativeProject
    ? force || !areNativeSplashImagesCurrent(activeNativeManifest, rootDir, brand, fingerprints.nativeSplashImage)
    : false;
  const shouldWriteNativeLauncherImages = shouldSyncNativeProject
    ? force || !areNativeLauncherImagesCurrent(activeNativeManifest, rootDir, brand, fingerprints.nativeLauncherImage)
    : false;
  const shouldWriteNativeText = shouldSyncNativeProject
    ? force || !areNativeTextsCurrent(activeNativeManifest, rootDir, brand, fingerprints.nativeText)
    : false;
  const logo =
    shouldWriteGeneratedAssets || shouldWriteNativeSplashImages || (shouldWriteNativeLauncherImages && !appIconSource)
      ? decodePng(logoSource.bytes, logoSource.path)
      : null;
  const appIcon =
    appIconSource && (shouldWriteGeneratedAssets || shouldWriteNativeLauncherImages)
      ? decodePng(appIconSource.bytes, appIconSource.path)
      : null;
  if (shouldWriteGeneratedAssets) {
    writeGeneratedAssets(rootDir, brand, logo, appIcon);
  }
  if (shouldWriteNativeSplashImages) {
    writeNativeSplashImageResources(rootDir, brand, logo);
  }
  if (shouldWriteNativeLauncherImages) {
    writeNativeLauncherImageResources(rootDir, brand, logo, appIcon);
  }
  if (shouldWriteNativeText) {
    writeNativeTextResources(rootDir, brand);
  }
  if (shouldWriteNativeSplashImages || shouldWriteNativeLauncherImages || shouldWriteNativeText) {
    writeActiveNativeManifest(rootDir, brand, fingerprints);
  }
  writeGeneratedManifest(rootDir, brand, fingerprints);
  return brand;
}

module.exports = {
  DEFAULT_BRAND_ID,
  BRAND_ASSET_ROOT,
  GENERATED_BRAND_ASSETS_TS,
  GENERATED_BRAND_TS,
  SHARED_BRAND_CONFIG,
  SUPPORTED_LOCALES,
  loadBrandConfig,
  loadSharedBrandConfig,
  resolveBrandId,
  syncBrandArtifacts
};
