import { useAppSelector } from '../store/hooks';
import { THEMES } from '../../core/constants/theme';
import type { AppTheme } from '../../core/constants/theme';

export function useAppTheme(): AppTheme {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  return THEMES[themeMode] || THEMES.light;
}
