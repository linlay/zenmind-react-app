import { useEffect, useState, useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { toBackendBaseUrl } from '../core/network/endpoint';
import { restoreSession, getCurrentSession } from '../core/auth/appAuth';
import { loadSettings } from '../core/storage/settingsStorage';
import { hydrateSettings } from '../modules/user/state/userSlice';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useLoginController } from './hooks/useLoginController';
import { BootScreen } from './screens/BootScreen';
import { LoginScreen } from './screens/LoginScreen';
import { ShellScreen } from './shell/ShellScreen';

/**
 * AppRoot - 根路由编排器
 *
 * 职责：
 * 1. 维护配置加载与鉴权状态
 * 2. 基于状态切换 Boot/Login/Shell 路由阶段
 */
type RootStackParamList = {
  Boot: undefined;
  Login: undefined;
  Shell: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppRoot() {
  const dispatch = useAppDispatch();
  const { booting } = useAppBootstrap();
  const endpointInput = useAppSelector((state) => state.user.endpointInput);
  const backendUrl = toBackendBaseUrl(endpointInput);

  const [authChecking, setAuthChecking] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const loginController = useLoginController();

  /**
   * 加载配置（在组件挂载时执行）
   * 这会触发 hydrateSettings，将 booting 设置为 false
   */
  useEffect(() => {
    let mounted = true;
    loadSettings()
      .then((settings) => {
        if (!mounted) return;
        dispatch(hydrateSettings(settings));
      })
      .catch(() => {
        if (!mounted) return;
        dispatch(hydrateSettings({}));
      });

    return () => {
      mounted = false;
    };
  }, [dispatch]);

  /**
   * 同步鉴权状态：尝试恢复会话
   */
  const syncAuthState = useCallback(() => {
    if (booting) return;

    if (!backendUrl) {
      setAuthReady(false);
      setAuthChecking(false);
      return;
    }

    let cancelled = false;
    setAuthChecking(true);
    restoreSession(backendUrl)
      .then((session) => {
        if (cancelled) return;
        setAuthReady(Boolean(session));
      })
      .catch(() => {
        if (cancelled) return;
        setAuthReady(false);
      })
      .finally(() => {
        if (!cancelled) {
          setAuthChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backendUrl, booting]);

  // 监听端点变化，重新验证登录状态
  useEffect(() => {
    const cleanup = syncAuthState();
    return cleanup;
  }, [syncAuthState]);

  // 监听登录成功事件（通过检查 session 是否存在）
  useEffect(() => {
    const timer = setInterval(() => {
      const session = getCurrentSession();
      if (session && !authReady) {
        // 登录成功后刷新状态
        setAuthReady(true);
      } else if (!session && authReady) {
        // 登出后重置状态
        setAuthReady(false);
      }
    }, 500); // 每 500ms 检查一次

    return () => clearInterval(timer);
  }, [authReady]);

  const isBootPhase = booting || authChecking;
  const isLoginPhase = !isBootPhase && !authReady;
  const isShellPhase = !isBootPhase && authReady;
  const bootMessage = booting ? '正在加载配置...' : '正在验证登录状态...';

  return (
    <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false, animation: 'none' }}>
      {isBootPhase ? (
        <Stack.Screen name="Boot" options={{ animation: 'slide_from_right' }}>
          {() => <BootScreen message={bootMessage} />}
        </Stack.Screen>
      ) : null}
      {isLoginPhase ? (
        <Stack.Screen name="Login" options={{ animation: 'slide_from_right' }}>
          {() => <LoginScreen controller={loginController} />}
        </Stack.Screen>
      ) : null}
      {isShellPhase ? <Stack.Screen name="Shell" component={ShellScreen} /> : null}
    </Stack.Navigator>
  );
}
