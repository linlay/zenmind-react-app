import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

function loadGeneratedImportPathHelpers() {
  return require('../worklets/generated-import-paths.js') as {
    rewriteGeneratedWorkletImports: (
      content: string,
      sourceDirectory: string,
      targetDirectory: string,
      pathImplementation?: {
        resolve: typeof path.resolve;
        relative: typeof path.relative;
        sep: string;
      }
    ) => string;
  };
}

function readImportSpecifier(content: string, importedName: string) {
  const match = content.match(new RegExp(`import \\{ ${importedName} \\} from ["']([^"']+)["']`));
  assert.ok(match, `Expected an import for ${importedName}.`);
  return match[1];
}

test('rebases pnpm relative imports when generated Worklets files are copied', () => {
  const { rewriteGeneratedWorkletImports } = loadGeneratedImportPathHelpers();
  const sourceDirectory = path.join(
    '/workspace',
    'node_modules',
    '.pnpm',
    'react-native-worklets@peer-hash',
    'node_modules',
    'react-native-worklets',
    '.worklets'
  );
  const targetDirectory = path.join(
    '/workspace',
    'zenmind-react-app',
    '.generated',
    'react-native-worklets',
    '.worklets'
  );
  const originalSpecifier =
    '../../../../react-native-reanimated@peer-hash/node_modules/react-native-reanimated/src/Bezier';
  const content = `import { Bezier } from "${originalSpecifier}";`;

  const rewritten = rewriteGeneratedWorkletImports(content, sourceDirectory, targetDirectory);
  const rewrittenSpecifier = readImportSpecifier(rewritten, 'Bezier');

  assert.notEqual(rewrittenSpecifier, originalSpecifier);
  assert.equal(path.resolve(targetDirectory, rewrittenSpecifier), path.resolve(sourceDirectory, originalSpecifier));
});

test('rebases package-internal imports and preserves bare package imports', () => {
  const { rewriteGeneratedWorkletImports } = loadGeneratedImportPathHelpers();
  const sourceDirectory = path.join(
    '/workspace',
    'app',
    'node_modules',
    '.pnpm',
    'react-native-worklets@peer-hash',
    'node_modules',
    'react-native-worklets',
    '.worklets'
  );
  const targetDirectory = path.join('/workspace', 'app', '.generated', 'react-native-worklets', '.worklets');
  const originalInternalSpecifier = '../src/serializable';
  const content = [
    `import { serializable } from '${originalInternalSpecifier}';`,
    `import { Platform } from 'react-native';`
  ].join('\n');

  const rewritten = rewriteGeneratedWorkletImports(content, sourceDirectory, targetDirectory);
  const rewrittenInternalSpecifier = readImportSpecifier(rewritten, 'serializable');

  assert.equal(
    path.resolve(targetDirectory, rewrittenInternalSpecifier),
    path.resolve(sourceDirectory, originalInternalSpecifier)
  );
  assert.match(rewritten, /import \{ Platform \} from 'react-native';/);
});

test('rebases escaped Windows relative imports emitted by the Worklets plugin', () => {
  const { rewriteGeneratedWorkletImports } = loadGeneratedImportPathHelpers();
  const sourceDirectory = path.win32.join(
    'C:\\workspace',
    'node_modules',
    '.pnpm',
    'react-native-worklets@peer-hash',
    'node_modules',
    'react-native-worklets',
    '.worklets'
  );
  const targetDirectory = path.win32.join(
    'C:\\workspace',
    'zenmind-react-app',
    '.generated',
    'react-native-worklets',
    '.worklets'
  );
  const absoluteTarget = path.win32.join(
    'C:\\workspace',
    'node_modules',
    '.pnpm',
    'react-native-reanimated@peer-hash',
    'node_modules',
    'react-native-reanimated',
    'src',
    'Bezier'
  );
  const originalSpecifier = path.win32.relative(sourceDirectory, absoluteTarget);
  const content = `import { Bezier } from ${JSON.stringify(originalSpecifier)};`;

  const rewritten = rewriteGeneratedWorkletImports(content, sourceDirectory, targetDirectory, path.win32);
  const serializedSpecifier = readImportSpecifier(rewritten, 'Bezier');
  const rewrittenSpecifier = JSON.parse(`"${serializedSpecifier}"`) as string;

  assert.equal(path.win32.resolve(targetDirectory, rewrittenSpecifier), absoluteTarget);
  assert.equal(rewrittenSpecifier.includes('\\'), false);
});
