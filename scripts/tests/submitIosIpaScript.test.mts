import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  buildEasSubmitArgs,
  expandPath,
  parseSubmitIosIpaArgs,
  validateIpaPath
} = require('../submit-ios-ipa.js') as {
  buildEasSubmitArgs(profile: string, ipaPath: string): string[];
  expandPath(input: string, homeDir?: string, cwd?: string): string;
  parseSubmitIosIpaArgs(
    argv: string[],
    options?: { homeDir?: string; cwd?: string }
  ): { profile: string; ipaPath: string };
  validateIpaPath(ipaPath: string): void;
};

test('submit ios ipa parser ignores pnpm separator and builds one path argument', () => {
  const parsed = parseSubmitIosIpaArgs(['production-zenmind', '--', '/tmp/app.ipa']);

  assert.deepEqual(parsed, {
    profile: 'production-zenmind',
    ipaPath: '/tmp/app.ipa'
  });
  assert.deepEqual(buildEasSubmitArgs(parsed.profile, parsed.ipaPath), [
    'eas-cli',
    'submit',
    '-p',
    'ios',
    '--profile',
    'production-zenmind',
    '--path',
    '/tmp/app.ipa'
  ]);
});

test('submit ios ipa parser accepts explicit --path form', () => {
  const parsed = parseSubmitIosIpaArgs(['production-cutej', '--path', './dist/cutej.ipa'], {
    cwd: '/repo'
  });

  assert.deepEqual(parsed, {
    profile: 'production-cutej',
    ipaPath: '/repo/dist/cutej.ipa'
  });
});

test('submit ios ipa parser expands home-relative paths without duplicating username', () => {
  assert.equal(expandPath('~/project/git/zenmind/app.ipa', '/Users/ther'), '/Users/ther/project/git/zenmind/app.ipa');
});

test('submit ios ipa parser rejects ambiguous or missing paths', () => {
  assert.throws(
    () => parseSubmitIosIpaArgs(['production-zenmind', '/tmp/a.ipa', '/tmp/b.ipa']),
    /Unexpected argument/
  );
  assert.throws(() => parseSubmitIosIpaArgs(['production-zenmind']), /Missing IPA path/);
});

test('submit ios ipa validator requires an existing ipa file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenmind-submit-ios-ipa-'));
  try {
    const ipaPath = path.join(tempDir, 'app.ipa');
    fs.writeFileSync(ipaPath, 'fixture');
    assert.doesNotThrow(() => validateIpaPath(ipaPath));
    assert.throws(() => validateIpaPath(path.join(tempDir, 'app.zip')), /Expected an \.ipa file/);
    assert.throws(() => validateIpaPath(path.join(tempDir, 'missing.ipa')), /IPA file not found/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
