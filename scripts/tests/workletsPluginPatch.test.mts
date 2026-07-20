import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { transformSync } from '@babel/core';

const require = createRequire(import.meta.url);
const pluginPath = require.resolve('react-native-worklets/plugin');
const workletsPackageRoot = path.dirname(require.resolve('react-native-worklets/package.json'));
const generatedWorkletsDirectory = path.join(workletsPackageRoot, '.worklets');

type BabelPlugin = NonNullable<Parameters<typeof transformSync>[1]>['plugins'][number];

const installedPlugin = require(pluginPath) as BabelPlugin;

const REANIMATED_WORKLET_SOURCE = `
  import { IS_IOS } from '../../constants';
  export function PlatformColor(...names) {
    'worklet';
    return IS_IOS ? { semantic: names } : { resource_paths: names };
  }
`;

const WORKLETS_INTERNAL_SOURCE = `
  import { helper } from './helper';
  export function callHelper() {
    'worklet';
    return helper();
  }
`;

function createSourceFixture(packageDirectoryName: string, packageName: string, relativePath: string, source: string) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'worklets-plugin-source-'));
  const filename = path.join(
    temporaryRoot,
    'node_modules',
    '.pnpm',
    packageDirectoryName,
    'node_modules',
    packageName,
    relativePath
  );
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, source);
  return {
    cleanup() {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    },
    filename
  };
}

function transformAndReadGeneratedWorklet(plugin: BabelPlugin, filename: string, source: string) {
  const generatedFiles: string[] = [];
  const originalReadFileSync = fs.readFileSync;
  const originalWriteFileSync = fs.writeFileSync;
  const normalizedFilename = filename.replace(/\\/g, '/');
  fs.readFileSync = ((filePath: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    if (typeof filePath === 'string' && filePath.replace(/\\/g, '/').endsWith(normalizedFilename)) {
      return source;
    }
    return Reflect.apply(originalReadFileSync, fs, [filePath, ...args]);
  }) as typeof fs.readFileSync;
  fs.writeFileSync = ((filePath: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView) => {
    if (
      typeof filePath === 'string' &&
      path.dirname(filePath) === generatedWorkletsDirectory &&
      filePath.endsWith('.js')
    ) {
      generatedFiles.push(String(data));
      return;
    }
    return originalWriteFileSync(filePath, data);
  }) as typeof fs.writeFileSync;

  try {
    transformSync(source, {
      babelrc: false,
      configFile: false,
      filename,
      plugins: [[plugin, { bundleMode: true }]]
    });
  } finally {
    fs.readFileSync = originalReadFileSync;
    fs.writeFileSync = originalWriteFileSync;
  }

  assert.equal(generatedFiles.length, 1, 'Expected exactly one generated Worklet file.');
  return generatedFiles[0];
}

test('does not forward Reanimated relative imports because a pnpm peer suffix names Worklets', () => {
  const fixture = createSourceFixture(
    'react-native-reanimated@4.3.1_react-native-worklets@0.8.3_peer',
    'react-native-reanimated',
    'src/common/style/processors/colors.ts',
    REANIMATED_WORKLET_SOURCE
  );

  try {
    const generatedWorklet = transformAndReadGeneratedWorklet(
      installedPlugin,
      fixture.filename,
      REANIMATED_WORKLET_SOURCE
    );

    assert.doesNotMatch(generatedWorklet, /from ['"][^'"]*constants['"]/);
    assert.match(generatedWorklet, /PlatformColor[^]*Factory\(\{\s*IS_IOS\s*\}\)/);
  } finally {
    fixture.cleanup();
  }
});

test('continues forwarding relative imports for actual Worklets package paths', () => {
  const fixture = createSourceFixture(
    'react-native-worklets@0.8.3_peer',
    'react-native-worklets',
    'src/example.ts',
    WORKLETS_INTERNAL_SOURCE
  );

  try {
    const generatedWorklet = transformAndReadGeneratedWorklet(
      installedPlugin,
      fixture.filename,
      WORKLETS_INTERNAL_SOURCE
    );
    assert.match(generatedWorklet, /import \{ helper \} from/);
  } finally {
    fixture.cleanup();
  }
});

test('continues forwarding relative imports for Windows Worklets package paths', () => {
  const filename =
    'C:\\workspace\\node_modules\\.pnpm\\react-native-worklets@0.8.3_peer\\node_modules\\react-native-worklets\\src\\example.ts';

  const generatedWorklet = transformAndReadGeneratedWorklet(installedPlugin, filename, WORKLETS_INTERNAL_SOURCE);

  assert.match(generatedWorklet, /import \{ helper \} from/);
});
