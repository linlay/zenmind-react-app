import {
  FIREWORK_DEFAULT_DURATION_MS,
  FIREWORK_MAX_DURATION_MS,
  FIREWORK_MIN_DURATION_MS,
  createFireworksShow,
  normalizeFireworksArgs
} from '../fireworks';

describe('fireworks', () => {
  it('normalizes duration boundaries', () => {
    expect(normalizeFireworksArgs({ durationMs: 100 }).durationMs).toBe(FIREWORK_MIN_DURATION_MS);
    expect(normalizeFireworksArgs({ durationMs: 999999 }).durationMs).toBe(FIREWORK_MAX_DURATION_MS);
    expect(normalizeFireworksArgs(undefined).durationMs).toBe(FIREWORK_DEFAULT_DURATION_MS);
  });

  it('creates rockets and sparks', () => {
    const result = createFireworksShow(360, 640, { durationMs: 2000, bursts: 3, particlesPerBurst: 20 });
    expect(result.durationMs).toBe(2000);
    expect(result.rockets.length).toBeGreaterThan(0);
    expect(result.sparks.length).toBeGreaterThan(0);
  });
});
