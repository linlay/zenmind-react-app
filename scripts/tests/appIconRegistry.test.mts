import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { appIconRegistry } from '../../src/shared/icons/registries/appIconRegistry.ts';
import { appIconUsages } from '../../src/shared/icons/registries/appIconUsages.ts';
import { APP_LINE_ICON_OUTLINE_NAMES, APP_LINE_ICON_PATHS } from '../../src/shared/visual/appLineIconRegistry.ts';

const CHAT_PERSISTENCE_ROOT = path.join(process.cwd(), 'src/features/chatPersistence');

function walkTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walkTypeScriptFiles(fullPath));
      continue;
    }
    if (/\.(?:ts|tsx)$/u.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

test('app icon usages resolve to registered glyphs', () => {
  const missingGlyphs = Object.entries(appIconUsages)
    .filter(([, config]) => !(config.glyph in appIconRegistry))
    .map(([usage, config]) => `${usage}:${config.glyph}`);

  assert.deepEqual(missingGlyphs, []);
});

test('app icon registry exposes no unused glyphs', () => {
  const usedGlyphs = new Set(Object.values(appIconUsages).map((config) => config.glyph));
  const unusedGlyphs = Object.keys(appIconRegistry)
    .filter((glyph) => !usedGlyphs.has(glyph as keyof typeof appIconRegistry))
    .sort();

  assert.deepEqual(unusedGlyphs, []);
});

test('copy usages match the webclient outline glyph', () => {
  assert.equal('content_copy' in APP_LINE_ICON_OUTLINE_NAMES, true);
  assert.equal('content_copy' in APP_LINE_ICON_PATHS, false);

  const copyUsages = Object.values(appIconUsages).filter((config) => config.glyph === 'content_copy');
  assert.ok(copyUsages.length > 0);
  assert.equal(copyUsages.every((config) => config.strokeWidth === 1.8), true);
});

test('chat persistence components use AppIcon instead of AppLineIcon directly', () => {
  const violations = walkTypeScriptFiles(CHAT_PERSISTENCE_ROOT)
    .filter((filePath) => readFileSync(filePath, 'utf8').includes('AppLineIcon'))
    .map((filePath) => path.relative(process.cwd(), filePath));

  assert.deepEqual(violations, []);
});
