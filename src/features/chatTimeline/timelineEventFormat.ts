export function isTimelineObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function hasTimelineEventValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isTimelineObjectRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

export function safeTimelineJson(value: unknown): string {
  if (!isTimelineObjectRecord(value) && !Array.isArray(value)) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export function formatTimelineEventValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
    } catch {
      return trimmed;
    }
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isTimelineObjectRecord(value) || Array.isArray(value)) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '';
    }
  }
  return '';
}

export function firstTimelineEventText(...values: unknown[]): string {
  for (const value of values) {
    const text = formatTimelineEventValue(value);
    if (text) {
      return text;
    }
  }
  return '';
}
