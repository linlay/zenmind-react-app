import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module, { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { transformSync } from '@babel/core';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const pluginPath = require.resolve('react-native-worklets/plugin');
const workletsPackageRoot = path.dirname(require.resolve('react-native-worklets/package.json'));
const generatedWorkletsDirectory = path.join(workletsPackageRoot, '.worklets');
const patchPath = path.join(projectRoot, 'patches', 'react-native-worklets@0.8.3.patch');

type BabelPlugin = NonNullable<Parameters<typeof transformSync>[1]>['plugins'][number];

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

function loadPluginFromSource(source: string): BabelPlugin {
  const pluginModule = new Module(pluginPath);
  pluginModule.filename = pluginPath;
  pluginModule.paths = (
    Module as typeof Module & {
      _nodeModulePaths: (directory: string) => string[];
    }
  )._nodeModulePaths(path.dirname(pluginPath));
  (
    pluginModule as Module & {
      _compile: (content: string, filename: string) => void;
    }
  )._compile(source, pluginPath);

  const pluginExport = pluginModule.exports as BabelPlugin | { default: BabelPlugin };
  return typeof pluginExport === 'object' && pluginExport !== null && 'default' in pluginExport
    ? pluginExport.default
    : pluginExport;
}

function applySingleHunkPatch(source: string, patch: string) {
  const sourceLines = source.split('\n');
  const patchLines = patch.split('\n');
  const hunkIndex = patchLines.findIndex((line) => line.startsWith('@@ '));
  assert.notEqual(hunkIndex, -1, 'Expected one unified-diff hunk.');
  assert.equal(
    patchLines.findIndex((line, index) => index > hunkIndex && line.startsWith('@@ ')),
    -1,
    'Expected exactly one unified-diff hunk.'
  );

  const hunkHeader = patchLines[hunkIndex].match(/^@@ -(\d+),(\d+) \+\d+,\d+ @@/);
  assert.ok(hunkHeader, `Invalid unified-diff hunk header: ${patchLines[hunkIndex]}`);
  const oldStart = Number(hunkHeader[1]) - 1;
  const oldCount = Number(hunkHeader[2]);
  let sourceIndex = oldStart;
  const result = sourceLines.slice(0, oldStart);

  for (const line of patchLines.slice(hunkIndex + 1)) {
    if (line === '') {
      continue;
    }
    if (line.startsWith(' ')) {
      assert.equal(sourceLines[sourceIndex], line.slice(1), 'Patch context does not match upstream source.');
      result.push(sourceLines[sourceIndex]);
      sourceIndex += 1;
      continue;
    }
    if (line.startsWith('-')) {
      assert.equal(sourceLines[sourceIndex], line.slice(1), 'Patch removal does not match upstream source.');
      sourceIndex += 1;
      continue;
    }
    if (line.startsWith('+')) {
      result.push(line.slice(1));
      continue;
    }
    if (line === '\\ No newline at end of file') {
      continue;
    }
    assert.fail(`Unsupported unified-diff line: ${line}`);
  }

  assert.equal(sourceIndex, oldStart + oldCount, 'Patch did not consume the declared source range.');
  result.push(...sourceLines.slice(sourceIndex));
  return result.join('\n');
}

function loadPatchedPlugin() {
  assert.ok(fs.existsSync(patchPath), `Expected dependency patch at ${patchPath}.`);
  const source = applySingleHunkPatch(fs.readFileSync(pluginPath, 'utf8'), fs.readFileSync(patchPath, 'utf8'));
  return {
    plugin: loadPluginFromSource(source),
    source
  };
}

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
    const unpatchedPlugin = require(pluginPath) as BabelPlugin;
    const unpatchedWorklet = transformAndReadGeneratedWorklet(
      unpatchedPlugin,
      fixture.filename,
      REANIMATED_WORKLET_SOURCE
    );

    assert.match(unpatchedWorklet, /import \{ IS_IOS \} from ['"][^'"]*constants['"]/);

    const { plugin } = loadPatchedPlugin();
    const patchedWorklet = transformAndReadGeneratedWorklet(plugin, fixture.filename, REANIMATED_WORKLET_SOURCE);

    assert.doesNotMatch(patchedWorklet, /from ['"][^'"]*constants['"]/);
    assert.match(patchedWorklet, /PlatformColor[^]*Factory\(\{\s*IS_IOS\s*\}\)/);
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
    const { plugin } = loadPatchedPlugin();
    const generatedWorklet = transformAndReadGeneratedWorklet(plugin, fixture.filename, WORKLETS_INTERNAL_SOURCE);
    assert.match(generatedWorklet, /import \{ helper \} from/);
  } finally {
    fixture.cleanup();
  }
});

test('continues forwarding relative imports for Windows Worklets package paths', () => {
  const { plugin } = loadPatchedPlugin();
  const filename =
    'C:\\workspace\\node_modules\\.pnpm\\react-native-worklets@0.8.3_peer\\node_modules\\react-native-worklets\\src\\example.ts';

  const generatedWorklet = transformAndReadGeneratedWorklet(plugin, filename, WORKLETS_INTERNAL_SOURCE);

  assert.match(generatedWorklet, /import \{ helper \} from/);
});
