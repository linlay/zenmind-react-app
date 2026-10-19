import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const source = fs.readFileSync('metro.config.js', 'utf8');
type Resolver = (context: unknown, moduleName: string, platform: string) => { type: string; filePath: string };

function createMetroFixture(production: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worklets-metro-'));
  const projectRoot = path.join(root, 'app');
  const packageRoot = path.join(root, 'node_modules', 'react-native-worklets');
  const packageDirectory = path.join(packageRoot, '.worklets');
  const projectDirectory = path.join(projectRoot, '.generated', 'react-native-worklets', '.worklets');
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.mkdirSync(projectDirectory, { recursive: true });
  const originalResolver: Resolver = (_context, moduleName) => ({ type: 'sourceFile', filePath: moduleName });
  const config = {
    resolver: { assetExts: ['png'], resolveRequest: originalResolver },
    watchFolders: [] as string[],
    bundleMode: false
  };
  const fixtureRequire = Object.assign(
    (name: string) => {
      if (name === 'expo/metro-config') return { getDefaultConfig: () => config };
      if (name === 'nativewind/metro') return { withNativeWind: (value: unknown) => value };
      if (name === 'react-native-worklets/bundleMode') {
        return {
          getBundleModeMetroConfig: (value: typeof config) => {
            value.bundleMode = true;
            value.resolver.resolveRequest = (_context, moduleName) => ({
              type: 'sourceFile',
              filePath: `bundle-fallback:${moduleName}`
            });
            return value;
          }
        };
      }
      if (name === './scripts/worklets/bundle-mode-config') {
        const helpers = require('../worklets/bundle-mode-config.js');
        return {
          isWorkletsBundleModeEnabled: helpers.isWorkletsBundleModeEnabled,
          isProductionBuild: () => helpers.isProductionBuild({ NODE_ENV: production ? 'production' : 'development' })
        };
      }
      return require(name);
    },
    { resolve: () => path.join(packageRoot, 'package.json') }
  );
  try {
    vm.runInNewContext(source, { require: fixtureRequire, __dirname: projectRoot, module: { exports: {} } });
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return {
    config,
    packageDirectory,
    projectDirectory,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

test('development resolves and watches live Worklets instead of stale pregenerated copies', () => {
  const fixture = createMetroFixture(false);
  try {
    for (const directory of [fixture.packageDirectory, fixture.projectDirectory]) {
      fs.writeFileSync(path.join(directory, '123.js'), '// fixture');
    }
    assert.equal(fixture.config.bundleMode, true);
    assert.ok(fixture.config.watchFolders.includes(fixture.packageDirectory));
    const resolve = (hash: string) =>
      fixture.config.resolver.resolveRequest({}, `react-native-worklets/.worklets/${hash}.js`, 'android');
    assert.equal(resolve('123').filePath, path.join(fixture.packageDirectory, '123.js'));
    // A Worklet emitted after config loading must also resolve from the live directory.
    fs.writeFileSync(path.join(fixture.packageDirectory, '456.js'), '// new worklet');
    assert.equal(resolve('456').filePath, path.join(fixture.packageDirectory, '456.js'));
  } finally {
    fixture.cleanup();
  }
});

test('production keeps resolving the project-local Worklets with rebased imports', () => {
  const fixture = createMetroFixture(true);
  try {
    fs.writeFileSync(path.join(fixture.projectDirectory, '123.js'), '// fixture');
    assert.equal(fixture.config.bundleMode, true);
    assert.ok(fixture.config.watchFolders.includes(fixture.projectDirectory));
    const resolved = fixture.config.resolver.resolveRequest({}, 'react-native-worklets/.worklets/123.js', 'android');
    assert.equal(resolved.filePath, path.join(fixture.projectDirectory, '123.js'));
  } finally {
    fixture.cleanup();
  }
});
