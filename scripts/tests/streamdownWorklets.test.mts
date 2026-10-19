import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import { transformSync } from '@babel/core';

const require = createRequire(import.meta.url);
const generatedDirectory = path.join(path.dirname(require.resolve('react-native-worklets/package.json')), '.worklets');

test('project Babel options forward remend into the installed Streamdown Worklet', () => {
  const config = require('../../babel.config.js')({ cache: { using: (callback: () => unknown) => callback() } }) as {
    plugins: NonNullable<Parameters<typeof transformSync>[1]>['plugins'];
  };
  const filename = fs.realpathSync('node_modules/react-native-streamdown/lib/module/worklets/remendWorklet.js');
  const generatedFiles: string[] = [];
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = ((filePath: fs.PathOrFileDescriptor, content: string | NodeJS.ArrayBufferView) => {
    assert.equal(typeof filePath, 'string');
    assert.equal(path.dirname(String(filePath)), generatedDirectory);
    generatedFiles.push(String(content));
  }) as typeof fs.writeFileSync;

  let transformed: string | undefined | null;
  try {
    transformed = transformSync(fs.readFileSync(filename, 'utf8'), {
      babelrc: false,
      configFile: false,
      filename,
      plugins: config.plugins
    })?.code;
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }

  assert.equal(generatedFiles.length, 1);
  const generated = generatedFiles[0]!;
  assert.match(generated, /import remend from ['"]remend['"]/);
  assert.match(generated, /const result = remend\(markdown, mergedConfig\)/);
  const closure = generated.match(/__closure\s*=\s*\{([^}]+)\}/)?.[1];
  assert.ok(closure);
  assert.doesNotMatch(closure, /\bremend\b/);
  assert.match(transformed ?? '', /require\(['"]react-native-worklets\/\.worklets\/\d+\.js['"]\)/);
});
