import { Platform } from 'react-native';
import { ThemeMode } from '../types/common';

export const FONT_SANS = Platform.select({
  ios: 'Avenir Next',
  android: 'sans-serif',
  default: 'system-ui'
});

export const FONT_MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace'
});

export const THEMES = {
  light: {
    mode: 'light',
    gradient: ['#ffffff', '#ffffff', '#ffffff'],
    bgCircleA: 'transparent',
    bgCircleB: 'transparent',
    surface: '#ffffff',
    surfaceStrong: '#ffffff',
    surfaceSoft: '#ffffff',
    border: '#e7edf6',
    borderStrong: '#b9cbe5',
    text: '#27334a',
    textSoft: '#60728f',
    textMute: '#8d9bb2',
    primary: '#2f6cf3',
    primaryDeep: '#1f54c7',
    primarySoft: 'rgba(47, 108, 243, 0.13)',
    userBubble: ['#3b77f5', '#2a60dc'] as [string, string],
    assistantBubble: '#ffffff',
    systemBubble: '#fff1f1',
    timelineDot: '#7ea6ff',
    timelineLine: 'rgba(126, 166, 255, 0.42)',
    ok: '#1fa06c',
    warn: '#cc8c2f',
    danger: '#d65252',
    shadow: 'rgba(25, 49, 88, 0.14)',
    overlay: 'rgba(12, 22, 38, 0.34)',
    sendIcon: '#ffffff'
  },
  dark: {
    mode: 'dark',
    gradient: ['#10192b', '#10192b', '#10192b'],
    bgCircleA: 'transparent',
    bgCircleB: 'transparent',
    surface: '#10192b',
    surfaceStrong: '#10192b',
    surfaceSoft: '#10192b',
    border: '#25535a',
    borderStrong: '#3b6a71',
    text: '#ecf2ff',
    textSoft: '#b8caea',
    textMute: '#8ea8cf',
    primary: '#78a0ff',
    primaryDeep: '#5f89eb',
    primarySoft: 'rgba(120, 160, 255, 0.16)',
    userBubble: ['#5d84eb', '#4067cf'] as [string, string],
    assistantBubble: '#1a2d4c',
    systemBubble: '#3a2530',
    timelineDot: '#90b0ff',
    timelineLine: 'rgba(144, 176, 255, 0.45)',
    ok: '#34c88e',
    warn: '#e0ab58',
    danger: '#f17979',
    shadow: 'rgba(0, 0, 0, 0.38)',
    overlay: 'rgba(2, 7, 16, 0.62)',
    sendIcon: '#f5f8ff'
  }
} as const;

export type AppTheme = (typeof THEMES)[ThemeMode];
