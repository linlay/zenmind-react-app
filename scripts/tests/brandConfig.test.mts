import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const { loadBrandConfig, loadSharedBrandConfig, resolveBrandId, syncBrandArtifacts } =
  require('../lib/brand-config.js') as typeof import('../lib/brand-config.js');

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
  const androidMain = path.join(rootDir, 'android', 'app', 'src', 'main');
  fs.mkdirSync(androidMain, { recursive: true });
  fs.mkdirSync(path.join(androidMain, 'res', 'values'), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'android', 'app', 'build.gradle'),
    [
      'android {',
      "    namespace 'com.zqfrank.agentterminalapp'",
      '    defaultConfig {',
      "        applicationId 'com.zqfrank.agentterminalapp'",
      '        versionName "0.0.0"',
      '    }',
      '}',
      ''
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(androidMain, 'AndroidManifest.xml'),
    [
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '  <application android:label="@string/app_name" android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round">',
      '    <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="chat-messages"/>',
      '    <meta-data android:value="https://u.expo.dev/old" android:name="expo.modules.updates.EXPO_UPDATE_URL"/>',
      '  </application>',
      '</manifest>',
      ''
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(androidMain, 'res', 'values', 'colors.xml'),
    [
      '<resources>',
      '  <color name="splashscreen_background">#000000</color>',
      '  <color name="iconBackground">#000000</color>',
      '  <color name="notification_icon_color">#000000</color>',
      '</resources>'
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(androidMain, 'res', 'values', 'strings.xml'),
    [
      '<resources>',
      '  <string name="app_name">old</string>',
      '  <string name="expo_runtime_version">0.0.0</string>',
      '</resources>'
    ].join('\n')
  );

  const iosAppRoot = path.join(rootDir, 'ios', 'fixtureapp');
  const iosAssetRoot = path.join(iosAppRoot, 'Images.xcassets');
  fs.mkdirSync(path.join(iosAssetRoot, 'SplashScreenLogo.imageset'), { recursive: true });
  fs.mkdirSync(path.join(iosAssetRoot, 'SplashScreenBackground.colorset'), { recursive: true });
  fs.writeFileSync(
    path.join(iosAssetRoot, 'SplashScreenBackground.colorset', 'Contents.json'),
    `${JSON.stringify({ colors: [], info: { version: 1, author: 'expo' } }, null, 2)}\n`
  );
  fs.mkdirSync(path.join(iosAssetRoot, 'AppIcon.appiconset'), { recursive: true });
  fs.writeFileSync(
    path.join(iosAssetRoot, 'AppIcon.appiconset', 'Contents.json'),
    `${JSON.stringify(
      {
        images: [
          {
            filename: 'App-Icon-1024x1024@1x.png',
            idiom: 'universal',
            platform: 'ios',
            size: '1024x1024'
          }
        ],
        info: { version: 1, author: 'expo' }
      },
      null,
      2
    )}\n`
  );
  fs.mkdirSync(path.join(rootDir, 'ios', 'fixtureapp.xcodeproj'), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, 'ios', 'fixtureapp.xcodeproj', 'project.pbxproj'),
    [
      'buildSettings = {',
      '  MARKETING_VERSION = 0.0.0;',
      '  PRODUCT_BUNDLE_IDENTIFIER = cc.zenmind.ios;',
      '  PRODUCT_NAME = fixtureapp;',
      '};',
      'buildSettings = {',
      '  MARKETING_VERSION = 0.0.0;',
      '  PRODUCT_BUNDLE_IDENTIFIER = cc.zenmind.ios;',
      '  PRODUCT_NAME = fixtureapp;',
      '};',
      ''
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(iosAppRoot, 'Info.plist'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '  <key>CFBundleDisplayName</key>',
      '  <string>Old</string>',
      '  <key>CFBundleShortVersionString</key>',
      '  <string>0.0.0</string>',
      '  <key>CFBundleURLTypes</key>',
      '  <array>',
      '    <dict>',
      '      <key>CFBundleURLSchemes</key>',
      '      <array>',
      '        <string>cc.zenmind.ios</string>',
      '      </array>',
      '    </dict>',
      '  </array>',
      '</dict>',
      '</plist>',
      ''
    ].join('\n')
  );
}

test('brand config resolves argv and env brand ids', () => {
  const rootDir = createBrandFixtureRoot();
  try {
    assert.equal(resolveBrandId(['--brand', 'cutej'], {}, rootDir), 'cutej');
    assert.equal(resolveBrandId(['--brand=zenmind'], {}, rootDir), 'zenmind');
    assert.equal(resolveBrandId(['CuteJ'], {}, rootDir), 'cutej');
    assert.equal(resolveBrandId(['run:android'], {}, rootDir, { allowPositional: false }), 'zenmind');
    assert.equal(resolveBrandId(['run:android', '--brand', 'cutej'], {}, rootDir, { allowPositional: false }), 'cutej');
    assert.equal(resolveBrandId([], { BRAND: 'CuteJ' }, rootDir), 'cutej');
    assert.equal(resolveBrandId([], {}, rootDir), 'zenmind');
    assert.equal(syncBrandArtifacts({ rootDir }).id, 'zenmind');
    assert.equal(syncBrandArtifacts({ rootDir, brandId: 'cutej' }).id, 'cutej');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brand manifests share native identity and EAS project but keep presentation distinct', () => {
  const shared = loadSharedBrandConfig(process.cwd());
  const zenmind = loadBrandConfig(process.cwd(), 'zenmind', '9.9.9');
  const cutej = loadBrandConfig(process.cwd(), 'cutej', '9.9.9');
  const zenmindManifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'brands', 'zenmind', 'brand.json'), 'utf8')
  );
  const cutejManifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'brands', 'cutej', 'brand.json'), 'utf8'));

  assert.equal(zenmind.productName, 'Zenmind');
  assert.equal(cutej.productName, 'CuteJ');
  assert.equal(zenmind.android.package, shared.androidPackage);
  assert.equal(cutej.android.package, shared.androidPackage);
  assert.equal(zenmind.ios.bundleIdentifier, shared.bundleIdentifier);
  assert.equal(cutej.ios.bundleIdentifier, shared.bundleIdentifier);
  assert.equal(zenmind.storageNamespace, shared.storageNamespace);
  assert.equal(zenmind.slug, shared.updates.projectSlug);
  assert.equal(cutej.slug, shared.updates.projectSlug);
  assert.equal(zenmind.updates.projectId, shared.updates.projectId);
  assert.equal(cutej.updates.projectId, shared.updates.projectId);
  assert.equal(cutej.updates.url, shared.updates.url);
  assert.equal(zenmindManifest.slug, undefined);
  assert.equal(cutejManifest.slug, undefined);
  assert.equal(zenmindManifest.android.package, undefined);
  assert.equal(cutejManifest.ios, undefined);
  assert.equal(cutejManifest.updates, undefined);
  assert.notEqual(zenmind.generatedAssets.logo, cutej.generatedAssets.logo);
  assert.equal(zenmind.source.appIcon, 'brands/zenmind/app-icon.png');
  assert.equal(cutej.source.appIcon, null);
  assert.equal(zenmind.version, '9.9.9');
  assert.equal(cutej.generatedAssets.logo, 'assets/brands/cutej/logo.png');
});

test('brand sync requires a checked-in logo source', () => {
  const rootDir = createBrandFixtureRoot();
  try {
    fs.rmSync(path.join(rootDir, 'assets', 'brands', 'zenmind', 'logo.png'));
    assert.throws(() => syncBrandArtifacts({ rootDir, brandId: 'zenmind' }), /Brand logo source not found/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brand sync requires a configured app icon source', () => {
  const rootDir = createBrandFixtureRoot();
  try {
    fs.rmSync(path.join(rootDir, 'brands', 'zenmind', 'app-icon.png'));
    assert.throws(() => syncBrandArtifacts({ rootDir, brandId: 'zenmind' }), /Brand app icon source not found/);
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
    const generatedBrandTs = fs.readFileSync(path.join(rootDir, 'src', 'shared', 'generated', 'brand.ts'), 'utf8');
    assert.match(generatedBrandTs, /"cutej": \{/);
    assert.match(generatedBrandTs, /resolveInstalledBrandId\(APP_BRANDS, DEFAULT_BRAND_ID\)/);
    assert.equal(generatedBrandTs.includes('ACTIVE_BRAND_ID'), false);
    assert.match(
      fs.readFileSync(path.join(rootDir, 'src', 'shared', 'generated', 'brandAssets.ts'), 'utf8'),
      /BRAND_LOGOS = \{[\s\S]*"cutej": brandLogo_cutej/
    );
    const logoPath = path.join(rootDir, 'assets', 'brands', 'zenmind', 'logo.png');
    const originalLogo = fs.readFileSync(logoPath);
    assert.deepEqual(fs.readFileSync(logoPath), originalLogo);

    pngEncodeCount = 0;
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    assert.equal(pngEncodeCount, 0);

    syncBrandArtifacts({ rootDir, brandId: 'cutej' });
    assert.equal(
      fs.readFileSync(path.join(rootDir, 'src', 'shared', 'generated', 'brand.ts'), 'utf8'),
      generatedBrandTs
    );
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

    fs.copyFileSync(path.join(rootDir, 'assets', 'brands', 'cutej', 'logo.png'), logoPath);

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
    assert.equal(pngEncodeCount, 27);

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

test('brand sync switches the active native project brand without stale cache reuse', () => {
  const rootDir = createBrandFixtureRoot();
  createNativeSplashFixture(rootDir);
  const originalDeflateSync = zlib.deflateSync;
  let pngEncodeCount = 0;
  zlib.deflateSync = ((...args: Parameters<typeof zlib.deflateSync>) => {
    pngEncodeCount += 1;
    return originalDeflateSync(...args);
  }) as typeof zlib.deflateSync;

  const activeManifestPath = path.join(rootDir, '.generated', 'brand', 'native-active-manifest.json');
  const splashPath = path.join(
    rootDir,
    'android',
    'app',
    'src',
    'main',
    'res',
    'drawable-mdpi',
    'splashscreen_logo.png'
  );
  const colorsPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'colors.xml');
  const stringsPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  const iosProjectPath = path.join(rootDir, 'ios', 'fixtureapp.xcodeproj', 'project.pbxproj');
  const iosInfoPath = path.join(rootDir, 'ios', 'fixtureapp', 'Info.plist');
  const iosAppIconPath = path.join(
    rootDir,
    'ios',
    'fixtureapp',
    'Images.xcassets',
    'AppIcon.appiconset',
    'App-Icon-1024x1024@1x.png'
  );

  try {
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    const zenmindSplash = fs.readFileSync(splashPath);
    const zenmindAppIcon = fs.readFileSync(iosAppIconPath);
    assert.equal(JSON.parse(fs.readFileSync(activeManifestPath, 'utf8')).brandId, 'zenmind');

    pngEncodeCount = 0;
    syncBrandArtifacts({ rootDir, brandId: 'cutej' });
    assert.equal(JSON.parse(fs.readFileSync(activeManifestPath, 'utf8')).brandId, 'cutej');
    assert.notDeepEqual(fs.readFileSync(splashPath), zenmindSplash);
    assert.notDeepEqual(fs.readFileSync(iosAppIconPath), zenmindAppIcon);
    assert.equal(pngEncodeCount, 27);
    assert.match(fs.readFileSync(colorsPath, 'utf8'), /<color name="splashscreen_background">#F5F7FA<\/color>/);
    assert.match(fs.readFileSync(colorsPath, 'utf8'), /<color name="iconBackground">#172033<\/color>/);
    assert.match(fs.readFileSync(colorsPath, 'utf8'), /<color name="notification_icon_color">#FF6B9A<\/color>/);
    assert.match(fs.readFileSync(stringsPath, 'utf8'), /<string name="app_name">CuteJ<\/string>/);
    assert.equal(fs.readFileSync(stringsPath, 'utf8').includes('brand_id'), false);
    assert.match(
      fs.readFileSync(manifestPath, 'utf8'),
      /android:value="https:\/\/u\.expo\.dev\/e6cc69ea-7449-44f2-ae7c-69831be52d5c"/
    );
    assert.match(fs.readFileSync(gradlePath, 'utf8'), /applicationId 'com\.zqfrank\.agentterminalapp'/);
    assert.match(fs.readFileSync(iosProjectPath, 'utf8'), /PRODUCT_BUNDLE_IDENTIFIER = cc\.zenmind\.ios;/);
    assert.match(fs.readFileSync(iosProjectPath, 'utf8'), /PRODUCT_NAME = CuteJ;/);
    assert.match(fs.readFileSync(iosProjectPath, 'utf8'), /MARKETING_VERSION = 1\.0\.0;/);
    assert.match(fs.readFileSync(iosInfoPath, 'utf8'), /<string>CuteJ<\/string>/);
    assert.match(fs.readFileSync(iosInfoPath, 'utf8'), /<string>cc\.zenmind\.ios<\/string>/);
    assert.equal(fs.readFileSync(iosInfoPath, 'utf8').includes('AppBrandId'), false);

    pngEncodeCount = 0;
    syncBrandArtifacts({ rootDir, brandId: 'cutej' });
    assert.equal(pngEncodeCount, 0);

    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    assert.equal(JSON.parse(fs.readFileSync(activeManifestPath, 'utf8')).brandId, 'zenmind');
    assert.deepEqual(fs.readFileSync(splashPath), zenmindSplash);
    assert.deepEqual(fs.readFileSync(iosAppIconPath), zenmindAppIcon);
  } finally {
    zlib.deflateSync = originalDeflateSync;
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brand sync updates native text without decoding or encoding png assets', () => {
  const rootDir = createBrandFixtureRoot();
  createNativeSplashFixture(rootDir);
  const originalDeflateSync = zlib.deflateSync;
  const originalInflateSync = zlib.inflateSync;
  let pngEncodeCount = 0;
  let pngDecodeCount = 0;
  zlib.deflateSync = ((...args: Parameters<typeof zlib.deflateSync>) => {
    pngEncodeCount += 1;
    return originalDeflateSync(...args);
  }) as typeof zlib.deflateSync;
  zlib.inflateSync = ((...args: Parameters<typeof zlib.inflateSync>) => {
    pngDecodeCount += 1;
    return originalInflateSync(...args);
  }) as typeof zlib.inflateSync;

  const brandManifestPath = path.join(rootDir, 'brands', 'zenmind', 'brand.json');
  const sharedConfigPath = path.join(rootDir, 'brands', 'shared.json');
  const colorsPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'colors.xml');
  const stringsPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  const iosProjectPath = path.join(rootDir, 'ios', 'fixtureapp.xcodeproj', 'project.pbxproj');

  try {
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });

    const brandManifest = JSON.parse(fs.readFileSync(brandManifestPath, 'utf8'));
    brandManifest.productName = 'Zenmind Text';
    brandManifest.expoName = 'Zenmind Text';
    brandManifest.notification.channel = 'text-only-channel';
    brandManifest.notification.color = '#112233';
    fs.writeFileSync(brandManifestPath, `${JSON.stringify(brandManifest, null, 2)}\n`);
    const sharedConfig = JSON.parse(fs.readFileSync(sharedConfigPath, 'utf8'));
    sharedConfig.updates.url = 'https://u.expo.dev/text-only';
    fs.writeFileSync(sharedConfigPath, `${JSON.stringify(sharedConfig, null, 2)}\n`);

    pngEncodeCount = 0;
    pngDecodeCount = 0;
    syncBrandArtifacts({ rootDir, brandId: 'zenmind' });
    assert.equal(pngEncodeCount, 0);
    assert.equal(pngDecodeCount, 0);
    assert.match(fs.readFileSync(stringsPath, 'utf8'), /<string name="app_name">Zenmind Text<\/string>/);
    assert.match(fs.readFileSync(colorsPath, 'utf8'), /<color name="notification_icon_color">#112233<\/color>/);
    assert.match(fs.readFileSync(gradlePath, 'utf8'), /applicationId 'com\.zqfrank\.agentterminalapp'/);
    assert.match(fs.readFileSync(iosProjectPath, 'utf8'), /PRODUCT_BUNDLE_IDENTIFIER = cc\.zenmind\.ios;/);
  } finally {
    zlib.deflateSync = originalDeflateSync;
    zlib.inflateSync = originalInflateSync;
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brand sync fails instead of caching stale native text when required fields are missing', () => {
  const rootDir = createBrandFixtureRoot();
  createNativeSplashFixture(rootDir);

  try {
    const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    fs.writeFileSync(
      manifestPath,
      fs
        .readFileSync(manifestPath, 'utf8')
        .replace(
          /^\s*<meta-data android:value="https:\/\/u\.expo\.dev\/old" android:name="expo\.modules\.updates\.EXPO_UPDATE_URL"\/>\n/mu,
          ''
        )
    );

    assert.throws(() => syncBrandArtifacts({ rootDir, brandId: 'cutej' }), /EXPO_UPDATE_URL/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('brand sync can skip native project writes during Expo config evaluation', () => {
  const rootDir = createBrandFixtureRoot();
  createNativeSplashFixture(rootDir);

  try {
    const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    fs.writeFileSync(
      manifestPath,
      fs
        .readFileSync(manifestPath, 'utf8')
        .replace(
          /^\s*<meta-data android:name="com\.google\.firebase\.messaging\.default_notification_channel_id" android:value="chat-messages"\/>\n/mu,
          ''
        )
    );

    const brand = syncBrandArtifacts({ rootDir, brandId: 'cutej', syncNativeProject: false });
    assert.equal(brand.id, 'cutej');
    assert.equal(
      fs.existsSync(path.join(rootDir, '.generated', 'brand', 'native-active-manifest.json')),
      false
    );
    assert.match(
      fs.readFileSync(path.join(rootDir, 'src', 'shared', 'generated', 'brand.ts'), 'utf8'),
      /"cutej": \{/
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
