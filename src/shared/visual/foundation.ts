import type { AppResolvedThemePreference } from './themePreference';
import foundationTokens from './foundation.tokens.json' with { type: 'json' };

export type VisualAvatarTone = {
  backgroundColor: string;
  foregroundColor: string;
};

export type VisualFontSize = {
  fontSize: number;
  lineHeight: number;
};

// Keep this theme source aligned with .doc/reference/ui-visual-theme.md.
export const appLightColors = foundationTokens.colors.light;
type AppVisualColorName = keyof typeof appLightColors;

export type AppVisualColors = Readonly<Record<AppVisualColorName, string>>;

export const appDarkColors = foundationTokens.colors.dark satisfies AppVisualColors;

export const appThemeColors = {
  light: appLightColors,
  dark: appDarkColors,
} as const satisfies Record<AppResolvedThemePreference, AppVisualColors>;

const appAvatarPalette = foundationTokens.avatarPalette satisfies readonly VisualAvatarTone[];
const appFontSizes = foundationTokens.fontSizes satisfies Readonly<Record<string, VisualFontSize>>;

export const appVisualFoundation = {
  spacing: foundationTokens.spacing,
  radii: foundationTokens.radii,
  fontSizes: appFontSizes,
  iconSizes: foundationTokens.iconSizes,
  avatarPalette: appAvatarPalette,
} as const;

export type AppThemeTokens = typeof appVisualFoundation & {
  colors: AppVisualColors;
  preference: AppResolvedThemePreference;
  isDark: boolean;
};

export const appThemeTokens = {
  light: {
    ...appVisualFoundation,
    colors: appLightColors,
    preference: 'light',
    isDark: false,
  },
  dark: {
    ...appVisualFoundation,
    colors: appDarkColors,
    preference: 'dark',
    isDark: true,
  },
} as const satisfies Record<AppResolvedThemePreference, AppThemeTokens>;

export const appVisualTokens = {
  ...appVisualFoundation,
  colors: {
    ...appLightColors,
  },
} as const satisfies typeof appVisualFoundation & { colors: AppVisualColors };

const MAX_UNREAD_COUNT = 99;

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function formatConversationTimestamp(value: number, now: number = Date.now()): string {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    return '';
  }

  const timestamp = new Date(value);
  const current = new Date(now);
  if (Number.isNaN(timestamp.getTime()) || Number.isNaN(current.getTime())) {
    return '';
  }

  if (isSameDay(timestamp, current)) {
    return `${pad2(timestamp.getHours())}:${pad2(timestamp.getMinutes())}`;
  }

  if (timestamp.getFullYear() === current.getFullYear()) {
    return `${pad2(timestamp.getMonth() + 1)}-${pad2(timestamp.getDate())}`;
  }

  return `${timestamp.getFullYear()}-${pad2(timestamp.getMonth() + 1)}`;
}

export function formatUnreadCount(value: number): string {
  if (value > MAX_UNREAD_COUNT) {
    return `${MAX_UNREAD_COUNT}+`;
  }

  return String(value);
}

export function getAvatarTone(seed: string): VisualAvatarTone {
  const palette = appVisualTokens.avatarPalette;
  const hashedIndex = hashString(String(seed || 'zenmind')) % palette.length;
  return palette[hashedIndex] ?? palette[0];
}

export function getAvatarLabel(title: string): string {
  const normalized = String(title || '').trim();
  const glyphs = Array.from(normalized);
  const candidate =
    glyphs.find((glyph) => /[A-Za-z0-9]/.test(glyph) || /[\u3400-\u9fff]/.test(glyph)) ??
    glyphs[0] ??
    '?';

  return /[A-Za-z]/.test(candidate) ? candidate.toUpperCase() : candidate;
}
