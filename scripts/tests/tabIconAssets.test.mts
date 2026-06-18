import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const TAB_ICON_BASE_NAMES = ['tab-chat', 'tab-terminal', 'tab-drive', 'tab-me'] as const;

const TAB_ICON_DENSITIES = [
  { suffix: '', size: 24 },
  { suffix: '@2x', size: 48 },
  { suffix: '@3x', size: 72 },
] as const;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngSize(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  assert.equal(buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true);

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test('native tab icons use density assets sized to 24pt', () => {
  for (const baseName of TAB_ICON_BASE_NAMES) {
    for (const density of TAB_ICON_DENSITIES) {
      const filePath = path.join(process.cwd(), 'assets', 'tabs', `${baseName}${density.suffix}.png`);
      const size = readPngSize(filePath);

      assert.deepEqual(size, { width: density.size, height: density.size });
    }
  }
});
