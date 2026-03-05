import { useAppSelector } from '../store/hooks';
import { THEMES } from '../../core/constants/theme';
import type { AppTheme } from '../../core/constants/theme';

/**
 * 应用级状态接口
 */
export interface AppBootstrapState {
  /** 是否正在加载配置 */
  booting: boolean;
  /** 当前主题 */
  theme: AppTheme;
}

/**
 * 应用级状态管理 Hook
 *
 * 职责：
 * - 从 Redux 读取应用启动相关状态
 * - 提供主题信息给启动和登录屏幕
 *
 * 用于 AppRoot 的状态门卫逻辑
 *
 * 注意：authChecking 和 authReady 由 AppRoot 本地管理，不从 Redux 读取
 */
export function useAppBootstrap(): AppBootstrapState {
  const booting = useAppSelector((state) => state.user.booting);
  const themeMode = useAppSelector((state) => state.user.themeMode);

  const theme = THEMES[themeMode];

  return {
    booting,
    theme,
  };
}
