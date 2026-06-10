import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const { loadBrandConfig, resolveBrandId, syncBrandArtifacts } = require('../lib/brand-config.js') as typeof import('../lib/brand-config.js');

function createBrandFixtureRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenmind-brand-config-'));
  fs.cpSync(path.join(process.cwd(), 'brands'), path.join(rootDir, 'brands'), { recursive: true });
  for (const brandId of ['zenmind', 'cutej']) {
    const assetRoot = path.join(rootDir, 'assets', 'brands', brandId);
    fs.mkdirSync(assetRoot, { recursive: true });
    fs.copyFileSync(
      path.join(process.cwd(), 'assets', 'brands', brandId, 'logo.png'),
      path.join(assetRoot, 'logo.png')
    );
  }
  fs.writeFileSync(path.join(rootDir, 'package.json'), `${JSON.stringify({ version: '1.0.0' }, null, 2)}\n`);
  return rootDir;
}

function createNativeSplashFixture(rootDir: string) {
  fs.mkdirSync(path.join(rootDir, 'android', 'app', 'src', 'main'), { recursive: true });
  fs.mkdirSync(
    path.join(rootDir, 'ios', 'fixtureapp', 'Images.xcassets', 'SplashScreenLogo.imageset'),
    { recursive: true }
  );
  fs.mkdirSync(
    path.join(rootDir, 'ios', 'fixtureapp', 'Images.xcassets', 'SplashScreenBackground.colorset'),
    { recursive: true }
  );
}

test('brand config resolves argv and env brand ids', () => {
  assert.equal(resolveBrandId(['--brand', 'cutej'], {}), 'cutej');
  assert.equal(resolveBrandId(['--brand=zenmind'], {}), 'zenmind');
  assert.equal(resolveBrandId([], { BRAND: 'CuteJ' }), 'cutej');
  assert.equal(resolveBrandId([], {}), 'zenmind');
});

test('brand manifests expose distinct native identities', () => {
  const zenmind = loadBrandConfig(process.cwd(), 'zenmind', '9.9.9');
  const cutej = loadBrandConfig(process.cwd(), 'cutej', '9.9.9');

  assert.equal(zenmind.productName, 'ZenMind');
  assert.equal(cutej.productName, 'CuteJ');
  assert.notEqual(zenmind.android.package, cutej.android.package);
  assert.notEqual(zenmind.ios.bundleIdentifier, cutej.ios.bundleIdentifier);
  assert.equal(zenmind.version, '9.9.9');
  assert.equal(cutej.generatedAssets.logo, 'assets/brands/cutej/logo.png');
});

test('brand sync requires a checked-in logo source', () => {
  const rootDir = createBrandFixtureRoot();
  try {
    fs.rmSync(path.join(rootDir, 'assets', 'brands', 'zenmind', 'logo.png'));
    assert.throws(
      () => syncBrandArtifacts({ rootDir, brandId: 'zenmind' }),
      /Brand logo source not found/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brand sync redraws derived png assets only when visual inputs or logo source change', () => {
  const rootDir = createBrandFixtureRoot();
  const originalDeflateSync = zlib.deflateSync;
  let pngEncodeCount = 0;
  zlib.deflateSync = ((...args: Parameters<typeof zlib.deflateSync>) => {
    pngEncodeCount += 1;
    return originalDeflateSync(...args);
  }) as typeof zlib.deflateSync;

  try {
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    assert.equal(pngEncodeCount, 3);
    const logoPath = path.join(rootDir, 'assets', 'brands', 'zenmind', 'logo.png');
    const originalLogo = fs.readFileSync(logoPath);
    assert.deepEqual(fs.readFileSync(logoPath), originalLogo);

    pngEncodeCount = 0;
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    assert.equal(pngEncodeCount, 0);

    syncBrandArtifacts({ rootDir, brandId: 'cutej' });
    assert.equal(pngEncodeCount, 3);

    pngEncodeCount = 0;
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    assert.equal(pngEncodeCount, 0);

    const manifestPath = path.join(rootDir, 'assets', 'brands', 'zenmind', 'manifest.json');
    const firstManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    fs.writeFileSync(
      path.join(rootDir, 'brands', 'zenmind', 'i18n', 'en-US.json'),
      `${JSON.stringify({ 'app.name': 'ZenMind Test', 'app.productName': 'ZenMind Test' }, null, 2)}\n`
    );

    pngEncodeCount = 0;
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    const i18nManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.notEqual(i18nManifest.runtimeFingerprint, firstManifest.runtimeFingerprint);
    assert.equal(i18nManifest.assetFingerprint, firstManifest.assetFingerprint);
    assert.equal(pngEncodeCount, 0);

    const brandManifestPath = path.join(rootDir, 'brands', 'zenmind', 'brand.json');
    const brandManifest = JSON.parse(fs.readFileSync(brandManifestPath, 'utf8'));
    brandManifest.visual.primaryColor = '#2F81EE';
    fs.writeFileSync(brandManifestPath, `${JSON.stringify(brandManifest, null, 2)}\n`);

    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    const visualManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.notEqual(visualManifest.assetFingerprint, i18nManifest.assetFingerprint);
    assert.equal(pngEncodeCount, 3);
    assert.deepEqual(fs.readFileSync(logoPath), originalLogo);

    fs.copyFileSync(
      path.join(rootDir, 'assets', 'brands', 'cutej', 'logo.png'),
      logoPath
    );

    pngEncodeCount = 0;
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    const logoManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.notEqual(logoManifest.assetFingerprint, visualManifest.assetFingerprint);
    assert.equal(pngEncodeCount, 3);
  } finally {
    zlib.deflateSync = originalDeflateSync;
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brand sync redraws native splash assets only when splash inputs change', () => {
  const rootDir = createBrandFixtureRoot();
  createNativeSplashFixture(rootDir);
  const originalDeflateSync = zlib.deflateSync;
  let pngEncodeCount = 0;
  zlib.deflateSync = ((...args: Parameters<typeof zlib.deflateSync>) => {
    pngEncodeCount += 1;
    return originalDeflateSync(...args);
  }) as typeof zlib.deflateSync;

  try {
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    assert.equal(pngEncodeCount, 11);

    pngEncodeCount = 0;
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    assert.equal(pngEncodeCount, 0);

    const brandManifestPath = path.join(rootDir, 'brands', 'zenmind', 'brand.json');
    const brandManifest = JSON.parse(fs.readFileSync(brandManifestPath, 'utf8'));
    brandManifest.splash.imageWidth = 224;
    fs.writeFileSync(brandManifestPath, `${JSON.stringify(brandManifest, null, 2)}\n`);

    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    assert.equal(pngEncodeCount, 8);
  } finally {
    zlib.deflateSync = originalDeflateSync;
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
