import type { AppResolvedThemePreference } from './themePreference';

export type VisualAvatarTone = {
  backgroundColor: string;
  foregroundColor: string;
};

// Keep this theme source aligned with .doc/reference/ui-visual-theme.md.
export const appLightColors = {
  brandBlue: '#2f6df6',
  brandBlueStrong: '#255fef',
  brandBlueSoft: '#edf3ff',
  brandBlueAction: '#1677ff',
  onBrandBlueAction: '#ffffff',
  textPrimary: '#17233a',
  textSecondary: '#8b96a9',
  textTertiary: '#b8c0ce',
  line: '#eceff4',
  lineStrong: '#dfe5ee',
  surface: '#ffffff',
  surfaceMuted: '#f6f8fc',
  surfaceRaised: '#ffffff',
  background: '#ffffff',
  backgroundMuted: '#f4f7fb',
  badge: '#2f6df6',
  success: '#2b9a60',
  warning: '#eb8a19',
  danger: '#ef6464',
  dangerSoft: '#fff5f5',
  dangerLine: '#ffd6d6',
  overlay: 'rgba(23, 35, 58, 0.18)',
  shadow: '#0f1728',
} as const;

type AppVisualColorName = keyof typeof appLightColors;

export type AppVisualColors = Readonly<Record<AppVisualColorName, string>>;

export const appDarkColors = {
  brandBlue: '#afc6ff',
  brandBlueStrong: '#d9e2ff',
  brandBlueSoft: '#17315f',
  brandBlueAction: '#1677ff',
  onBrandBlueAction: '#ffffff',
  textPrimary: '#e0e2ed',
  textSecondary: '#c1c6d7',
  textTertiary: '#8b90a0',
  line: '#272a32',
  lineStrong: '#414755',
  surface: '#181b23',
  surfaceMuted: '#1c1f28',
  surfaceRaised: '#272a32',
  background: '#0b0e16',
  backgroundMuted: '#10131b',
  badge: '#1677ff',
  success: '#6bd897',
  warning: '#ffb695',
  danger: '#ffb4ab',
  dangerSoft: '#2a1115',
  dangerLine: '#7a343b',
  overlay: 'rgba(0, 0, 0, 0.62)',
  shadow: '#000000',
} as const satisfies AppVisualColors;

export const appThemeColors = {
  light: appLightColors,
  dark: appDarkColors,
} as const satisfies Record<AppResolvedThemePreference, AppVisualColors>;

export const appVisualFoundation = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 18,
    pill: 999,
  },
  iconSizes: {
    sm: 18,
    md: 22,
    lg: 24,
    xl: 26,
    xxl: 28,
  },
  avatarPalette: [
    {
      backgroundColor: '#f08200',
      foregroundColor: '#ffffff',
    },
    {
      backgroundColor: '#34915a',
      foregroundColor: '#ffffff',
    },
    {
      backgroundColor: '#2c9bd8',
      foregroundColor: '#ffffff',
    },
    {
      backgroundColor: '#4a78f2',
      foregroundColor: '#ffffff',
    },
    {
      backgroundColor: '#ff7d63',
      foregroundColor: '#ffffff',
    },
    {
      backgroundColor: '#1faf8a',
      foregroundColor: '#ffffff',
    },
  ] satisfies readonly VisualAvatarTone[],
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
