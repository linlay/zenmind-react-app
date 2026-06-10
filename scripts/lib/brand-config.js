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

const BRAND_ASSET_ROOT = 'assets/brands';
const GENERATED_BRAND_TS = 'src/shared/generated/brand.ts';
const GENERATED_BRAND_ASSETS_TS = 'src/shared/generated/brandAssets.ts';
const GENERATED_ASSET_MANIFEST_NAME = 'manifest.json';
const BRAND_ASSET_GENERATOR_VERSION = 3;
const ICON_LOGO_SCALE = 0.76;
const ADAPTIVE_ICON_LOGO_SCALE = 0.72;
const FAVICON_LOGO_SCALE = 0.72;
const ANDROID_SPLASH_DENSITIES = [
  { directory: 'drawable-mdpi', multiplier: 1 },
  { directory: 'drawable-hdpi', multiplier: 1.5 },
  { directory: 'drawable-xhdpi', multiplier: 2 },
  { directory: 'drawable-xxhdpi', multiplier: 3 },
  { directory: 'drawable-xxxhdpi', multiplier: 4 },
];
const IOS_SPLASH_SCALES = [
  { filename: 'image.png', ratio: 1 },
  { filename: 'image@2x.png', ratio: 2 },
  { filename: 'image@3x.png', ratio: 3 },
];

function normalizeBrandId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!BRAND_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid brand id: ${value}`);
  }
  return normalized;
}

function resolveBrandId(argv = process.argv.slice(2), env = process.env) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--brand' && argv[index + 1]) {
      return normalizeBrandId(argv[index + 1]);
    }
    if (arg.startsWith('--brand=')) {
      return normalizeBrandId(arg.slice('--brand='.length));
    }
  }
  return normalizeBrandId(env.BRAND || DEFAULT_BRAND_ID);
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

function normalizeManifest(rootDir, brandRoot, manifest, i18n, appVersion) {
  const id = requireString(manifest, 'id').toLowerCase();
  if (!BRAND_ID_PATTERN.test(id)) {
    throw new Error(`Brand manifest field "id" is invalid: ${id}`);
  }
  if (id !== path.basename(brandRoot)) {
    throw new Error(`Brand manifest id "${id}" must match directory "${path.basename(brandRoot)}".`);
  }

  const productName = requireString(manifest, 'productName');
  const expoName = requireString(manifest, 'expoName');
  const slug = validateSlug(requireString(manifest, 'slug'));
  const storageNamespace = validateSlug(requireString(manifest, 'storageNamespace'));
  const androidPackage = validateNativeId('android.package', requireNestedString(manifest, 'android', 'package'));
  const bundleIdentifier = validateNativeId(
    'ios.bundleIdentifier',
    requireNestedString(manifest, 'ios', 'bundleIdentifier')
  );
  const updatesProjectId = requireNestedString(manifest, 'updates', 'projectId');
  const updatesUrl = requireNestedString(manifest, 'updates', 'url');
  const notificationChannel = requireNestedString(manifest, 'notification', 'channel');
  const splashImageWidth = Number(manifest.splash?.imageWidth);
  if (!Number.isFinite(splashImageWidth) || splashImageWidth <= 0) {
    throw new Error('Brand manifest field "splash.imageWidth" must be a positive number.');
  }

  const brandAssetRoot = `${BRAND_ASSET_ROOT}/${id}`;
  const generatedAssets = {
    icon: `${brandAssetRoot}/icon.png`,
    adaptiveIcon: `${brandAssetRoot}/adaptive-icon.png`,
    logo: `${brandAssetRoot}/logo.png`,
    favicon: `${brandAssetRoot}/favicon.png`,
  };

  return {
    id,
    productName,
    expoName,
    slug,
    version: appVersion,
    storageNamespace,
    android: {
      package: androidPackage,
      adaptiveIconBackgroundColor: requireHexColor(manifest, 'android', 'adaptiveIconBackgroundColor'),
    },
    ios: {
      bundleIdentifier,
    },
    updates: {
      projectId: updatesProjectId,
      url: updatesUrl,
    },
    splash: {
      backgroundColor: requireHexColor(manifest, 'splash', 'backgroundColor'),
      imageWidth: splashImageWidth,
    },
    notification: {
      channel: notificationChannel,
      color: requireHexColor(manifest, 'notification', 'color'),
    },
    visual: {
      backgroundColor: requireHexColor(manifest, 'visual', 'backgroundColor'),
      backgroundColorEnd: requireHexColor(manifest, 'visual', 'backgroundColorEnd'),
      primaryColor: requireHexColor(manifest, 'visual', 'primaryColor'),
      secondaryColor: requireHexColor(manifest, 'visual', 'secondaryColor'),
    },
    i18n,
    generatedAssets,
    source: {
      brandRoot: repoRelative(rootDir, brandRoot),
    },
  };
}

function loadBrandConfig(rootDir = process.cwd(), brandId = resolveBrandId(), appVersion = readPackageVersion(rootDir)) {
  const id = normalizeBrandId(brandId);
  const brandRoot = path.join(rootDir, 'brands', id);
  const manifestPath = path.join(brandRoot, 'brand.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Brand manifest not found: ${repoRelative(rootDir, manifestPath)}`);
  }

  const manifest = readJson(manifestPath);
  const i18n = loadBrandI18n(rootDir, brandRoot, manifest);
  return normalizeManifest(rootDir, brandRoot, manifest, i18n, appVersion);
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
    splash: brand.splash,
    i18n: brand.i18n,
  };
}

function writeGeneratedBrandFiles(rootDir, brand) {
  const payload = runtimeBrandPayload(brand);
  const brandTsPath = path.join(rootDir, GENERATED_BRAND_TS);
  const brandTsContent = [
    `export const APP_BRAND = ${JSON.stringify(payload, null, 2)} as const;`,
    '',
    'export const BRAND_ID = APP_BRAND.id;',
    'export const PRODUCT_NAME = APP_BRAND.productName;',
    'export const EXPO_NAME = APP_BRAND.expoName;',
    'export const APP_SLUG = APP_BRAND.slug;',
    'export const APP_VERSION = APP_BRAND.version;',
    'export const STORAGE_NAMESPACE = APP_BRAND.storageNamespace;',
    'export const BRAND_SPLASH_BACKGROUND_COLOR = APP_BRAND.splash.backgroundColor;',
    'export const BRAND_SPLASH_IMAGE_WIDTH = APP_BRAND.splash.imageWidth;',
    '',
  ].join('\n');
  writeFileIfChanged(brandTsPath, brandTsContent);

  const brandAssetsTsPath = path.join(rootDir, GENERATED_BRAND_ASSETS_TS);
  const logoPath = path.join(rootDir, brand.generatedAssets.logo);
  const logoImportPath = toPosixPath(path.relative(path.dirname(brandAssetsTsPath), logoPath));
  const normalizedLogoImportPath = logoImportPath.startsWith('.') ? logoImportPath : `./${logoImportPath}`;
  const brandAssetsTsContent = [`import logo from '${normalizedLogoImportPath}';`, '', 'export const BRAND_LOGO = logo;', ''].join(
    '\n'
  );
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

function brandRuntimeFingerprint(brand) {
  return hashStableJson({
    brand: runtimeBrandPayload(brand),
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
    path: logoPath,
  };
}

function brandAssetFingerprint(brand, logoHash) {
  return hashStableJson({
    assetGenerator: BRAND_ASSET_GENERATOR_VERSION,
    logo: logoHash,
    visual: brand.visual,
  });
}

function brandNativeSplashFingerprint(brand, logoHash) {
  return hashStableJson({
    assetGenerator: BRAND_ASSET_GENERATOR_VERSION,
    logo: logoHash,
    splash: brand.splash,
  });
}

function generatedManifestPath(rootDir, brand) {
  return path.join(path.dirname(path.join(rootDir, brand.generatedAssets.icon)), GENERATED_ASSET_MANIFEST_NAME);
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

function generatedDerivedAssetFilesExist(rootDir, brand) {
  return [brand.generatedAssets.icon, brand.generatedAssets.adaptiveIcon, brand.generatedAssets.favicon].every((relativePath) =>
    fs.existsSync(path.join(rootDir, relativePath))
  );
}

function areGeneratedAssetsCurrent(manifest, rootDir, brand, assetFingerprint) {
  return manifest?.assetFingerprint === assetFingerprint && generatedDerivedAssetFilesExist(rootDir, brand);
}

function androidSplashResourceFilesExist(rootDir) {
  const androidMainPath = path.join(rootDir, 'android', 'app', 'src', 'main');
  if (!fs.existsSync(androidMainPath)) {
    return true;
  }

  return ANDROID_SPLASH_DENSITIES.every((density) =>
    fs.existsSync(path.join(androidMainPath, 'res', density.directory, 'splashscreen_logo.png'))
  );
}

function iosSplashResourceFilesExist(rootDir) {
  const iosRoot = path.join(rootDir, 'ios');
  if (!fs.existsSync(iosRoot)) {
    return true;
  }

  const projectDirectories = fs.readdirSync(iosRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const directory of projectDirectories) {
    const imageSetPath = path.join(iosRoot, directory.name, 'Images.xcassets', 'SplashScreenLogo.imageset');
    if (!fs.existsSync(imageSetPath)) {
      continue;
    }

    if (!IOS_SPLASH_SCALES.every((scale) => fs.existsSync(path.join(imageSetPath, scale.filename)))) {
      return false;
    }
  }

  return true;
}

function nativeSplashResourceFilesExist(rootDir) {
  return androidSplashResourceFilesExist(rootDir) && iosSplashResourceFilesExist(rootDir);
}

function areNativeSplashResourcesCurrent(manifest, rootDir, nativeSplashFingerprint) {
  return manifest?.nativeSplashFingerprint === nativeSplashFingerprint && nativeSplashResourceFilesExist(rootDir);
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
        nativeSplashFingerprint: fingerprints.nativeSplash,
        assetGeneratorVersion: BRAND_ASSET_GENERATOR_VERSION,
        assets: brand.generatedAssets,
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
    a: 255,
  };
}

function mixColor(left, right, amount) {
  return {
    r: Math.round(left.r + (right.r - left.r) * amount),
    g: Math.round(left.g + (right.g - left.g) * amount),
    b: Math.round(left.b + (right.b - left.b) * amount),
    a: Math.round(left.a + (right.a - left.a) * amount),
  };
}

function createPng(size, height = size) {
  return {
    width: size,
    height,
    data: Buffer.alloc(size * height * 4),
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
    pngChunk('IEND'),
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
    height: maxY - minY + 1,
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
    [x1, y1, tx * ty],
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
    a: Math.round(result[3]),
  };
}

function drawPngFit(target, source, maxWidth, maxHeight = maxWidth, { trimTransparent = false } = {}) {
  const bounds = trimTransparent ? findOpaqueBounds(source) : { x: 0, y: 0, width: source.width, height: source.height };
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
    secondary: hexToRgb(brand.visual.secondaryColor),
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

function createLogoSplashPng(logo, canvasSize, imageSize) {
  const png = createPng(canvasSize);
  drawPngFit(png, logo, imageSize, imageSize);
  return encodePng(png);
}

function writeGeneratedAssets(rootDir, brand, logo) {
  const assetRoot = path.dirname(path.join(rootDir, brand.generatedAssets.icon));
  const icon = createLogoIconPng(brand, logo, 1024, ICON_LOGO_SCALE);
  const adaptiveIcon = createLogoForegroundPng(logo, 1024, ADAPTIVE_ICON_LOGO_SCALE);
  const favicon = createLogoIconPng(brand, logo, 64, FAVICON_LOGO_SCALE);
  writeFileIfChanged(path.join(assetRoot, 'icon.png'), icon);
  writeFileIfChanged(path.join(assetRoot, 'adaptive-icon.png'), adaptiveIcon);
  writeFileIfChanged(path.join(assetRoot, 'favicon.png'), favicon);
}

function writeAndroidSplashResources(rootDir, brand, logo) {
  const androidMainPath = path.join(rootDir, 'android', 'app', 'src', 'main');
  if (!fs.existsSync(androidMainPath)) {
    return;
  }

  for (const density of ANDROID_SPLASH_DENSITIES) {
    const canvasSize = Math.round(288 * density.multiplier);
    const imageSize = Math.round(brand.splash.imageWidth * density.multiplier);
    writeFileIfChanged(
      path.join(androidMainPath, 'res', density.directory, 'splashscreen_logo.png'),
      createLogoSplashPng(logo, canvasSize, imageSize)
    );
  }

  const colorsPath = path.join(androidMainPath, 'res', 'values', 'colors.xml');
  if (fs.existsSync(colorsPath)) {
    const colors = fs.readFileSync(colorsPath, 'utf8');
    const nextColors = colors.replace(
      /(<color name="splashscreen_background">)#[0-9a-fA-F]{6}(<\/color>)/u,
      `$1${brand.splash.backgroundColor}$2`
    );
    writeFileIfChanged(colorsPath, nextColors);
  }
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
            red: decimalColorComponent(color.r),
          },
          'color-space': 'srgb',
        },
        idiom: 'universal',
      },
    ],
    info: {
      version: 1,
      author: 'expo',
    },
  };
}

function writeIosSplashResources(rootDir, brand, logo) {
  const iosRoot = path.join(rootDir, 'ios');
  if (!fs.existsSync(iosRoot)) {
    return;
  }

  const projectDirectories = fs.readdirSync(iosRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const directory of projectDirectories) {
    const imageSetPath = path.join(iosRoot, directory.name, 'Images.xcassets', 'SplashScreenLogo.imageset');
    if (!fs.existsSync(imageSetPath)) {
      continue;
    }

    for (const scale of IOS_SPLASH_SCALES) {
      const imageSize = Math.round(brand.splash.imageWidth * scale.ratio);
      writeFileIfChanged(
        path.join(imageSetPath, scale.filename),
        createLogoSplashPng(logo, imageSize, imageSize)
      );
    }

    const backgroundPath = path.join(
      iosRoot,
      directory.name,
      'Images.xcassets',
      'SplashScreenBackground.colorset',
      'Contents.json'
    );
    if (fs.existsSync(backgroundPath)) {
      writeFileIfChanged(backgroundPath, `${JSON.stringify(splashBackgroundContents(brand.splash.backgroundColor), null, 2)}\n`);
    }
  }
}

function writeNativeSplashResources(rootDir, brand, logo) {
  writeAndroidSplashResources(rootDir, brand, logo);
  writeIosSplashResources(rootDir, brand, logo);
}

function syncBrandArtifacts({
  rootDir = process.cwd(),
  brandId = resolveBrandId(),
  appVersion = readPackageVersion(rootDir),
  force = false,
} = {}) {
  const brand = loadBrandConfig(rootDir, brandId, appVersion);
  const logoSource = readRequiredLogoSource(rootDir, brand);
  const fingerprints = {
    runtime: brandRuntimeFingerprint(brand),
    asset: brandAssetFingerprint(brand, logoSource.hash),
    nativeSplash: brandNativeSplashFingerprint(brand, logoSource.hash),
  };
  const manifest = readGeneratedManifest(rootDir, brand);
  writeGeneratedBrandFiles(rootDir, brand);
  const shouldWriteGeneratedAssets = force || !areGeneratedAssetsCurrent(manifest, rootDir, brand, fingerprints.asset);
  const shouldWriteNativeSplash = force || !areNativeSplashResourcesCurrent(manifest, rootDir, fingerprints.nativeSplash);
  const logo =
    shouldWriteGeneratedAssets || shouldWriteNativeSplash ? decodePng(logoSource.bytes, logoSource.path) : null;
  if (shouldWriteGeneratedAssets) {
    writeGeneratedAssets(rootDir, brand, logo);
  }
  if (shouldWriteNativeSplash) {
    writeNativeSplashResources(rootDir, brand, logo);
  }
  writeGeneratedManifest(rootDir, brand, fingerprints);
  return brand;
}

module.exports = {
  DEFAULT_BRAND_ID,
  BRAND_ASSET_ROOT,
  GENERATED_BRAND_ASSETS_TS,
  GENERATED_BRAND_TS,
  SUPPORTED_LOCALES,
  loadBrandConfig,
  resolveBrandId,
  syncBrandArtifacts,
};
