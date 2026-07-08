import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  PLANNING_WRITING_GRADIENT_STOPS,
  PLANNING_WRITING_SHIMMER_DURATION_MS,
  resolvePlanningWritingGradientWindow,
} from '../../src/features/chatPersistence/components/planningWritingShimmerConfig.ts';

const runtimePlanningBlockSource = readFileSync(
  path.join(process.cwd(), 'src/features/chatPersistence/components/RuntimePlanningBlock.tsx'),
  'utf8'
);

test('planning writing shimmer mirrors desktop skeleton timing and color stops', () => {
  assert.equal(PLANNING_WRITING_SHIMMER_DURATION_MS, 2000);
  assert.deepEqual(PLANNING_WRITING_GRADIENT_STOPS, [
    { offset: '25%', colorRole: 'textTertiary' },
    { offset: '50%', colorRole: 'textPrimary' },
    { offset: '75%', colorRole: 'textTertiary' },
  ]);
});

test('planning writing shimmer scans a 200 percent gradient window across localized text', () => {
  assert.deepEqual(resolvePlanningWritingGradientWindow(0), { x1: -2, x2: 0 });
  assert.deepEqual(resolvePlanningWritingGradientWindow(0.5), { x1: 0, x2: 2 });
  assert.deepEqual(resolvePlanningWritingGradientWindow(1), { x1: 2, x2: 4 });
  assert.deepEqual(resolvePlanningWritingGradientWindow(-1), { x1: -2, x2: 0 });
  assert.deepEqual(resolvePlanningWritingGradientWindow(2), { x1: 2, x2: 4 });
});

test('planning writing shimmer does not drive animation through React render state', () => {
  assert.match(runtimePlanningBlockSource, /useAnimatedProps/);
  assert.match(runtimePlanningBlockSource, /withRepeat/);
  assert.doesNotMatch(runtimePlanningBlockSource, /Animated as RNAnimated/);
  assert.doesNotMatch(runtimePlanningBlockSource, /addListener/);
  assert.doesNotMatch(runtimePlanningBlockSource, /setGradientWindow/);
});
