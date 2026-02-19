export const FIREWORK_COLORS = ['#ffd166', '#ff6b6b', '#4cc9f0', '#80ed99', '#ff9f1c', '#c77dff'];
export const FIREWORK_MIN_DURATION_MS = 900;
export const FIREWORK_MAX_DURATION_MS = 15000;
export const FIREWORK_DEFAULT_DURATION_MS = 5000;

function clampNumber(rawValue: unknown, min: number, max: number, fallback: number): number {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseFireworkPalette(rawPalette: unknown): string[] {
  const list = Array.isArray(rawPalette)
    ? rawPalette
    : typeof rawPalette === 'string'
      ? rawPalette.split(/[\s,|]+/)
      : [];

  const colors = list
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return colors.length ? colors : FIREWORK_COLORS;
}

export function normalizeFireworksArgs(rawArgs: unknown) {
  const args =
    rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : { durationMs: rawArgs };

  const durationMs = Math.round(
    clampNumber(
      args.durationMs ?? args.duration ?? args.ms,
      FIREWORK_MIN_DURATION_MS,
      FIREWORK_MAX_DURATION_MS,
      FIREWORK_DEFAULT_DURATION_MS
    )
  );
  const intensity = clampNumber(args.intensity, 0.55, 2.2, 1);
  const spread = clampNumber(args.spread, 0.7, 1.65, 1);
  const gravity = clampNumber(args.gravity, 0.65, 1.75, 1);
  const launchSpread = clampNumber(args.launchSpread, 0.2, 0.95, 0.58);
  const burstTop = clampNumber(args.burstTopRatio, 0.08, 0.42, 0.17);
  const burstBottom = clampNumber(args.burstBottomRatio, burstTop + 0.08, 0.72, 0.38);
  const burstInput = args.bursts ?? args.burstCount;
  const particleInput =
    args.particlesPerBurst ??
    args.particleCount ??
    args.sparkCount ??
    (burstInput === undefined ? args.count : undefined);

  const estimatedBursts = Math.max(2, Math.round(durationMs / 900));
  const bursts = Math.round(clampNumber(burstInput, 2, 8, estimatedBursts));
  const particlesPerBurst = Math.round(
    clampNumber(particleInput, 14, 90, 34 + Math.round(16 * intensity))
  );

  return {
    durationMs,
    bursts,
    particlesPerBurst,
    intensity,
    spread,
    gravity,
    launchSpread,
    burstTop,
    burstBottom,
    palette: parseFireworkPalette(args.palette ?? args.colors)
  };
}

export interface FireworkRocket {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  midDx: number;
  midDy: number;
  startT: number;
  midT: number;
  endT: number;
  size: number;
  tailLength: number;
  color: string;
  rotateDeg: string;
}

export interface FireworkSpark {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  midDx: number;
  midDy: number;
  startT: number;
  midT: number;
  peakT: number;
  fadeT: number;
  endT: number;
  size: number;
  trailLength: number;
  trailWidth: number;
  trailOpacity: number;
  color: string;
  rotateDeg: string;
}

export function createFireworksShow(width: number, height: number, rawArgs: unknown) {
  const config = normalizeFireworksArgs(rawArgs);
  const safeWidth = Math.max(300, width || 0);
  const safeHeight = Math.max(520, height || 0);
  const rockets: FireworkRocket[] = [];
  const sparks: FireworkSpark[] = [];
  const now = Date.now();

  const firstLaunchMs = 80;
  const timelineEndMs = Math.max(540, config.durationMs - 280);
  const launchWindowMs = Math.max(360, timelineEndMs - firstLaunchMs - 520);
  const launchBaseY = safeHeight + 30;

  for (let burstIndex = 0; burstIndex < config.bursts; burstIndex += 1) {
    const burstProgress = config.bursts <= 1 ? 0 : burstIndex / (config.bursts - 1);
    const baseStartMs = firstLaunchMs + launchWindowMs * burstProgress;
    const launchStartMs = clampNumber(
      baseStartMs + (Math.random() - 0.5) * 220,
      0,
      Math.max(80, timelineEndMs - 460),
      baseStartMs
    );
    const launchDurationMs = 420 + Math.random() * 320;
    const explodeAtMs = Math.min(timelineEndMs, launchStartMs + launchDurationMs);

    const centerX = safeWidth * (0.5 + (Math.random() - 0.5) * config.launchSpread);
    const centerY = safeHeight * (config.burstTop + Math.random() * (config.burstBottom - config.burstTop));
    const launchX = centerX + (Math.random() - 0.5) * 54;
    const launchY = launchBaseY + Math.random() * 30;
    const color = config.palette[(burstIndex + Math.floor(Math.random() * config.palette.length)) % config.palette.length];
    const rocketStartT = launchStartMs / config.durationMs;
    const rocketEndT = explodeAtMs / config.durationMs;
    const rocketMidT = rocketStartT + (rocketEndT - rocketStartT) * 0.55;
    const rocketDx = centerX - launchX;
    const rocketDy = centerY - launchY;

    rockets.push({
      id: `rocket-${now}-${burstIndex}`,
      x: launchX,
      y: launchY,
      dx: rocketDx,
      dy: rocketDy,
      midDx: rocketDx * 0.5,
      midDy: rocketDy * 0.52 - 18 - Math.random() * 14,
      startT: rocketStartT,
      midT: rocketMidT,
      endT: rocketEndT,
      size: 2.1 + Math.random() * 2.2,
      tailLength: 22 + Math.random() * 20,
      color,
      rotateDeg: `${(Math.atan2(rocketDy, rocketDx) * 180) / Math.PI + 90}deg`
    });

    const particleCount = Math.max(12, Math.round(config.particlesPerBurst * (0.72 + Math.random() * 0.58)));
    for (let sparkIndex = 0; sparkIndex < particleCount; sparkIndex += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (120 + Math.random() * 220) * config.intensity;
      const lifeMs = 760 + Math.random() * 880;
      const startMs = explodeAtMs + Math.random() * 90;
      const endMs = Math.min(config.durationMs - 45, startMs + lifeMs);
      if (endMs <= startMs + 170) continue;

      const lifeSec = (endMs - startMs) / 1000;
      const vx = Math.cos(angle) * speed * config.spread;
      const vy = Math.sin(angle) * speed * config.spread;
      const gravityY = 300 * config.gravity * (0.72 + Math.random() * 0.58);

      const dx = vx * lifeSec;
      const dy = vy * lifeSec + 0.5 * gravityY * lifeSec * lifeSec;
      const startT = startMs / config.durationMs;
      const endT = endMs / config.durationMs;
      const spanT = endT - startT;
      if (spanT <= 0.006) continue;

      const minGap = Math.max(0.0015, Math.min(0.012, spanT * 0.16));
      const midMin = startT + minGap;
      const midMax = endT - minGap;
      if (midMax <= midMin) continue;

      const peakMin = startT + minGap;
      const peakMax = endT - minGap * 2;
      if (peakMax <= peakMin) continue;

      const midT = clampNumber(startT + spanT * (0.5 + Math.random() * 0.2), midMin, midMax, startT + spanT * 0.62);
      const peakT = clampNumber(startT + spanT * (0.26 + Math.random() * 0.22), peakMin, peakMax, startT + spanT * 0.38);
      const fadeMin = peakT + minGap;
      const fadeMax = endT - minGap;
      if (fadeMax <= fadeMin) continue;
      const fadeT = clampNumber(startT + spanT * (0.7 + Math.random() * 0.16), fadeMin, fadeMax, startT + spanT * 0.84);
      if (!(startT < peakT && peakT < fadeT && fadeT < endT && startT < midT && midT < endT)) continue;

      const size = 1.8 + Math.random() * 3.1;
      const sparkColor = config.palette[
        (burstIndex + sparkIndex + Math.floor(Math.random() * config.palette.length)) % config.palette.length
      ];

      sparks.push({
        id: `spark-${now}-${burstIndex}-${sparkIndex}`,
        x: centerX + (Math.random() - 0.5) * 5,
        y: centerY + (Math.random() - 0.5) * 5,
        dx,
        dy,
        midDx: dx * (0.5 + Math.random() * 0.15) + (Math.random() - 0.5) * 22,
        midDy: dy * 0.48 - Math.abs(vy) * lifeSec * 0.23 - 8,
        startT,
        midT,
        peakT,
        fadeT,
        endT,
        size,
        trailLength: size * (2.4 + Math.random() * 3),
        trailWidth: Math.max(1, size * 0.34),
        trailOpacity: 0.26 + Math.random() * 0.24,
        color: sparkColor,
        rotateDeg: `${(Math.atan2(dy, dx) * 180) / Math.PI + 90}deg`
      });
    }
  }

  return {
    durationMs: config.durationMs,
    rockets,
    sparks
  };
}
