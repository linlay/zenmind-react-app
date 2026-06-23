import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = path.join(appRoot, 'src');
const coreRoot = path.join(sourceRoot, 'core');
const featuresRoot = path.join(sourceRoot, 'features');
const importPattern =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gmu;

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

function resolveImportPath(importer: string, specifier: string): string {
  if (specifier.startsWith('.')) {
    return path.normalize(path.resolve(path.dirname(importer), specifier));
  }
  return specifier;
}

test('src/core must not import src/features', () => {
  const violations: string[] = [];
  for (const filePath of walkTypeScriptFiles(coreRoot)) {
    const source = readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] || match[2] || '';
      const resolved = resolveImportPath(filePath, specifier);
      if (resolved === featuresRoot || resolved.startsWith(`${featuresRoot}${path.sep}`)) {
        violations.push(`${path.relative(appRoot, filePath)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
