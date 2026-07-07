import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDirectoryPickerLoadGate,
  getDirectoryPickerHiddenOffset,
  getDirectoryPickerPanelWidth,
} from '../../src/features/chatPersistence/chatDirectoryPickerOverlayState.ts';

test('directory picker load gate blocks duplicate page loads until release', () => {
  const gate = createDirectoryPickerLoadGate();

  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), false);

  gate.release();
  assert.equal(gate.tryAcquire(), true);

  gate.reset();
  assert.equal(gate.tryAcquire(), true);
});

test('directory picker hidden offset moves the whole panel outside the screen', () => {
  assert.equal(getDirectoryPickerPanelWidth(360), 310);
  assert.equal(getDirectoryPickerHiddenOffset(360), -310);
  assert.equal(getDirectoryPickerPanelWidth(1080), 390);
  assert.equal(getDirectoryPickerHiddenOffset(1080), -390);
});
