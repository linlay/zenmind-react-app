import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);

function readSource(relativePath: string): string {
  return readFileSync(path.join(appRoot, relativePath), 'utf8');
}

test('iOS cache backup exclusion plugin is idempotent and covers SQLite and MMKV', () => {
  const { addLocalCacheBackupExclusion } = require(path.join(appRoot, 'plugins/withLocalCacheBackupExclusion.js')) as {
    addLocalCacheBackupExclusion(contents: string): string;
  };
  const input = `class AppDelegate {
  func launch() {
    let delegate = ReactNativeDelegate()
  }

  // Linking API
}`;
  const once = addLocalCacheBackupExclusion(input);
  const twice = addLocalCacheBackupExclusion(once);

  assert.equal(twice, once);
  assert.match(once, /isExcludedFromBackup = true/u);
  assert.match(once, /\["SQLite", "mmkv"\]/u);
});

test('Expo Android configuration disables Auto Backup', () => {
  assert.match(readSource('app.config.js'), /allowBackup: false/u);
});

test('versioned iOS config plugin is registered and generates the backup exclusion', () => {
  assert.match(readSource('app.config.js'), /withLocalCacheBackupExclusion/u);
  const { addLocalCacheBackupExclusion } = require(path.join(appRoot, 'plugins/withLocalCacheBackupExclusion.js')) as {
    addLocalCacheBackupExclusion(contents: string): string;
  };
  const output = addLocalCacheBackupExclusion(`class AppDelegate {
    let delegate = ReactNativeDelegate()

  // Linking API
}`);
  assert.match(output, /excludeLocalCachesFromBackup\(\)/u);
  assert.match(output, /isExcludedFromBackup = true/u);
  assert.match(output, /\["SQLite", "mmkv"\]/u);
});
