import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const drawerSources = [
  {
    backdropNeedle: 'className={BACKDROP_CLASS}',
    closeLabel: "t('directoryPicker.close')",
    source: readFileSync('src/features/chatPersistence/components/ChatDirectoryPickerDrawer.tsx', 'utf8'),
  },
  {
    backdropNeedle: 'className={DRAWER_BACKDROP_CLASS}',
    closeLabel: "t('history.close')",
    source: readFileSync('src/features/chatPersistence/components/ChatDetailDrawers.tsx', 'utf8'),
  },
];

function extractPressableByAccessibilityLabel(source: string, labelNeedle: string): string {
  const labelIndex = source.indexOf(labelNeedle);
  assert.notEqual(labelIndex, -1, `Missing accessibility label: ${labelNeedle}`);

  const pressableStart = source.lastIndexOf('<Pressable', labelIndex);
  assert.notEqual(pressableStart, -1, `Missing Pressable before: ${labelNeedle}`);

  const pressableEnd = source.indexOf('>', labelIndex);
  assert.notEqual(pressableEnd, -1, `Missing Pressable end after: ${labelNeedle}`);

  return source.slice(pressableStart, pressableEnd);
}

function extractSelfClosingPressableByNeedle(source: string, needle: string): string {
  const needleIndex = source.indexOf(needle);
  assert.notEqual(needleIndex, -1, `Missing Pressable needle: ${needle}`);

  return source.slice(source.lastIndexOf('<Pressable', needleIndex), source.indexOf('/>', needleIndex));
}

test('chat drawer close affordances close on press-in and keep press fallback', () => {
  for (const { backdropNeedle, closeLabel, source } of drawerSources) {
    const closeButton = extractPressableByAccessibilityLabel(source, closeLabel);
    const backdrop = extractSelfClosingPressableByNeedle(source, backdropNeedle);

    assert.match(closeButton, /onPressIn=\{onClose\}/);
    assert.match(closeButton, /onPress=\{onClose\}/);
    assert.match(backdrop, /onPressIn=\{onClose\}/);
    assert.match(backdrop, /onPress=\{onClose\}/);
  }
});
