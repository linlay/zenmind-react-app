import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const composerSource = readFileSync(
  new URL('../../src/features/chatPersistence/components/Composer.tsx', import.meta.url),
  'utf8'
);

test('composer uses the native TextInput placeholder instead of an animated overlay', () => {
  assert.match(composerSource, /placeholder=\{placeholderText\}/);
  assert.match(composerSource, /placeholderTextColor=\{theme\.colors\.textSecondary\}/);
  assert.doesNotMatch(composerSource, /placeholder=""/);
  assert.doesNotMatch(composerSource, /INPUT_PLACEHOLDER/);
  assert.doesNotMatch(composerSource, /placeholderStyle/);
});

test('composer lets native TextInput use one baseline path for placeholder and typed text', () => {
  const inputClass = composerSource.match(/const INPUT_CLASS =\n\s+'([^']+)'/u)?.[1] ?? '';
  assert.ok(inputClass, 'expected INPUT_CLASS to be a static class string');
  assert.doesNotMatch(inputClass, /leading-\[/u);
});
