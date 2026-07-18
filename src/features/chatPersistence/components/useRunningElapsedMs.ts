import { useEffect, useState } from 'react';

const RUNNING_DURATION_TICK_MS = 1000;

function getStartedAt(value: number | null | undefined): number | null {
  const startedAt = Number(value);
  return Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null;
}

function getElapsedMs(startedAt: number, now: number): number {
  return Math.max(0, now - startedAt);
}

function getNextTickDelay(startedAt: number, now: number): number {
  if (now < startedAt) {
    return Math.max(1, startedAt + RUNNING_DURATION_TICK_MS - now);
  }
  const remainder = getElapsedMs(startedAt, now) % RUNNING_DURATION_TICK_MS;
  return remainder === 0 ? RUNNING_DURATION_TICK_MS : RUNNING_DURATION_TICK_MS - remainder;
}

export function useRunningElapsedMs(
  startedAtValue: number | null | undefined,
  enabled = true,
): number | null {
  const startedAt = getStartedAt(startedAtValue);
  const [elapsedMs, setElapsedMs] = useState(() =>
    startedAt === null ? null : getElapsedMs(startedAt, Date.now()),
  );

  useEffect(() => {
    if (!enabled || startedAt === null) {
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const schedule = (now: number) => {
      timeout = setTimeout(tick, getNextTickDelay(startedAt, now));
    };
    const update = (now: number) => {
      const nextElapsedMs = getElapsedMs(startedAt, now);
      setElapsedMs((current) => (current === nextElapsedMs ? current : nextElapsedMs));
    };
    function tick() {
      const now = Date.now();
      update(now);
      schedule(now);
    }

    const now = Date.now();
    update(now);
    schedule(now);
    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [enabled, startedAt]);

  return enabled && startedAt !== null ? elapsedMs : null;
}
