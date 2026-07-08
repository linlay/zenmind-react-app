export const PLANNING_WRITING_SHIMMER_DURATION_MS = 2000;
export const PLANNING_WRITING_TEXT_HEIGHT = 21;
export const PLANNING_WRITING_TEXT_FONT_SIZE = 15;
export const PLANNING_WRITING_TEXT_BASELINE_Y = 16;
export const PLANNING_WRITING_TEXT_FONT_WEIGHT = '800';

export const PLANNING_WRITING_GRADIENT_STOPS = [
  { offset: '25%', colorRole: 'textTertiary' },
  { offset: '50%', colorRole: 'textPrimary' },
  { offset: '75%', colorRole: 'textTertiary' },
] as const;

export type PlanningWritingGradientWindow = {
  x1: number;
  x2: number;
};

export function resolvePlanningWritingGradientWindow(progress: number): PlanningWritingGradientWindow {
  'worklet';
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const x1 = -2 + clampedProgress * 4;

  return {
    x1,
    x2: x1 + 2,
  };
}
