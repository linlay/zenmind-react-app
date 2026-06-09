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
const REQUIRED_VISUAL_GLYPHS = new Set(['zenmind', 'cutej']);

const GENERATED_ASSET_ROOT = 'assets/generated/brand';
const GENERATED_BRAND_TS = 'src/shared/generated/brand.ts';
const GENERATED_BRAND_ASSETS_TS = 'src/shared/generated/brandAssets.ts';
const GENERATED_ASSET_MANIFEST_NAME = 'manifest.json';
const BRAND_ASSET_GENERATOR_VERSION = 2;

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

  const visualGlyph = requireNestedString(manifest, 'visual', 'glyph');
  if (!REQUIRED_VISUAL_GLYPHS.has(visualGlyph)) {
    throw new Error(`Brand manifest field "visual.glyph" is unsupported: ${visualGlyph}`);
  }

  const generatedAssetRoot = `${GENERATED_ASSET_ROOT}/${id}`;
  const generatedAssets = {
    icon: `${generatedAssetRoot}/icon.png`,
    adaptiveIcon: `${generatedAssetRoot}/adaptive-icon.png`,
    logo: `${generatedAssetRoot}/logo.png`,
    favicon: `${generatedAssetRoot}/favicon.png`,
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
      glyph: visualGlyph,
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

function brandAssetFingerprint(brand) {
  return hashStableJson({
    assetGenerator: BRAND_ASSET_GENERATOR_VERSION,
    visual: brand.visual,
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

function generatedAssetFilesExist(rootDir, brand) {
  return Object.values(brand.generatedAssets).every((relativePath) => fs.existsSync(path.join(rootDir, relativePath)));
}

function areGeneratedAssetsCurrent(rootDir, brand, assetFingerprint) {
  const manifest = readGeneratedManifest(rootDir, brand);
  return manifest?.assetFingerprint === assetFingerprint && generatedAssetFilesExist(rootDir, brand);
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

function createPng(size) {
  return {
    width: size,
    height: size,
    data: Buffer.alloc(size * size * 4),
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

function drawLine(png, x1, y1, x2, y2, thickness, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  for (let index = 0; index <= steps; index += 1) {
    const amount = index / steps;
    drawCircle(png, x1 + dx * amount, y1 + dy * amount, thickness / 2, color);
  }
}

function drawArc(png, cx, cy, radius, startRadians, endRadians, thickness, color) {
  const steps = Math.max(24, Math.ceil(Math.abs(endRadians - startRadians) * radius));
  for (let index = 0; index <= steps; index += 1) {
    const amount = index / steps;
    const angle = startRadians + (endRadians - startRadians) * amount;
    drawCircle(png, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, thickness / 2, color);
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

function drawZenmindMark(png, palette, scale = 1) {
  const size = png.width;
  const primary = { ...palette.primary, a: 255 };
  const secondary = { ...palette.secondary, a: 235 };
  const soft = { ...palette.secondary, a: 62 };
  const thickness = size * 0.074 * scale;
  const inset = size * 0.27;
  const left = inset;
  const right = size - inset;
  const top = inset;
  const bottom = size - inset;

  drawGlow(png, size * 0.5, size * 0.5, size * 0.34, palette.secondary, 90);
  drawLine(png, left, top, right, top, thickness, secondary);
  drawLine(png, right, top, left, bottom, thickness, primary);
  drawLine(png, left, bottom, right, bottom, thickness, secondary);
  drawLine(png, size * 0.42, size * 0.5, size * 0.66, size * 0.5, thickness * 0.52, soft);
  drawCircle(png, left, top, thickness * 0.72, secondary);
  drawCircle(png, right, bottom, thickness * 0.72, primary);
  drawCircle(png, size * 0.5, size * 0.5, thickness * 0.5, { ...palette.background, a: 210 });
  drawCircle(png, size * 0.5, size * 0.5, thickness * 0.22, { ...palette.secondary, a: 255 });
}

function drawCutejMark(png, palette, scale = 1) {
  const size = png.width;
  const primary = { ...palette.primary, a: 255 };
  const secondary = { ...palette.secondary, a: 235 };
  const thickness = size * 0.066 * scale;

  drawGlow(png, size * 0.5, size * 0.5, size * 0.33, palette.primary, 70);
  drawArc(png, size * 0.5, size * 0.48, size * 0.25, Math.PI * 0.77, Math.PI * 1.95, thickness, secondary);
  drawLine(png, size * 0.61, size * 0.3, size * 0.61, size * 0.61, thickness, primary);
  drawArc(png, size * 0.51, size * 0.61, size * 0.1, 0, Math.PI * 0.92, thickness, primary);
  drawCircle(png, size * 0.61, size * 0.25, thickness * 0.5, secondary);
  drawCircle(png, size * 0.38, size * 0.43, thickness * 0.34, primary);
}

function createPalette(brand) {
  return {
    background: hexToRgb(brand.visual.backgroundColor),
    backgroundEnd: hexToRgb(brand.visual.backgroundColorEnd),
    primary: hexToRgb(brand.visual.primaryColor),
    secondary: hexToRgb(brand.visual.secondaryColor),
  };
}

function drawBrandMark(png, brand, palette, scale) {
  if (brand.visual.glyph === 'cutej') {
    drawCutejMark(png, palette, scale);
    return;
  }
  drawZenmindMark(png, palette, scale);
}

function createIconPng(brand, size) {
  const png = createPng(size);
  const palette = createPalette(brand);
  fillGradient(png, palette.background, palette.backgroundEnd);
  drawGlow(png, size * 0.5, size * 0.38, size * 0.42, palette.secondary, 54);
  drawGlow(png, size * 0.18, size * 0.85, size * 0.32, palette.primary, 34);
  drawBrandMark(png, brand, palette, 1);
  return encodePng(png);
}

function createTransparentMarkPng(brand, size) {
  const png = createPng(size);
  drawBrandMark(png, brand, createPalette(brand), 1.12);
  return encodePng(png);
}

function writeGeneratedAssets(rootDir, brand) {
  const assetRoot = path.dirname(path.join(rootDir, brand.generatedAssets.icon));
  const icon = createIconPng(brand, 1024);
  const transparentMark = createTransparentMarkPng(brand, 1024);
  const favicon = createIconPng(brand, 64);
  writeFileIfChanged(path.join(assetRoot, 'icon.png'), icon);
  writeFileIfChanged(path.join(assetRoot, 'adaptive-icon.png'), transparentMark);
  writeFileIfChanged(path.join(assetRoot, 'logo.png'), transparentMark);
  writeFileIfChanged(path.join(assetRoot, 'favicon.png'), favicon);
}

function syncBrandArtifacts({
  rootDir = process.cwd(),
  brandId = resolveBrandId(),
  appVersion = readPackageVersion(rootDir),
  force = false,
} = {}) {
  const brand = loadBrandConfig(rootDir, brandId, appVersion);
  const fingerprints = {
    runtime: brandRuntimeFingerprint(brand),
    asset: brandAssetFingerprint(brand),
  };
  writeGeneratedBrandFiles(rootDir, brand);
  if (force || !areGeneratedAssetsCurrent(rootDir, brand, fingerprints.asset)) {
    writeGeneratedAssets(rootDir, brand);
  }
  writeGeneratedManifest(rootDir, brand, fingerprints);
  return brand;
}

module.exports = {
  DEFAULT_BRAND_ID,
  GENERATED_ASSET_ROOT,
  GENERATED_BRAND_ASSETS_TS,
  GENERATED_BRAND_TS,
  SUPPORTED_LOCALES,
  loadBrandConfig,
  resolveBrandId,
  syncBrandArtifacts,
};
