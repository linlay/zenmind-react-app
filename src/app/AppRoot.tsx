import { useEffect, useState, useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector, useAppDispatch } from './store/hooks';
import { toBackendBaseUrl } from '../core/network/endpoint';
import { restoreSession, getCurrentSession, subscribeAuthSession } from '../core/auth/appAuth';
import { loadSettings, patchSettings } from '../core/storage/settingsStorage';
import { loadStoredAccounts, toStoredAccountSummary } from '../core/auth/authAccountsStorage';
import { hydrateAccounts, hydrateSettings } from '../modules/user/state/userSlice';
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
  const activeAccountId = useAppSelector((state) => state.user.activeAccountId);
  const accountSwitching = useAppSelector((state) => state.user.accountSwitching);
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
      .then(async (settings) => {
        const accounts = await loadStoredAccounts({
          migrationSettings: {
            endpointInput: settings.endpointInput,
            ptyUrlInput: settings.ptyUrlInput
          }
        });
        const activeAccount =
          accounts.find((item) => item.accountId === String(settings.activeAccountId || '').trim()) || accounts[0] || null;
        const needsActiveAccountSync =
          (Boolean(activeAccount) &&
            (activeAccount.accountId !== String(settings.activeAccountId || '').trim() ||
              activeAccount.endpointInput !== settings.endpointInput ||
              activeAccount.ptyUrlInput !== settings.ptyUrlInput)) ||
          (!activeAccount && Boolean(settings.activeAccountId));
        const nextSettings = needsActiveAccountSync
          ? await patchSettings({
              activeAccountId: activeAccount?.accountId || '',
              endpointInput: activeAccount?.endpointInput || settings.endpointInput,
              ptyUrlInput: activeAccount?.ptyUrlInput || settings.ptyUrlInput
            })
          : settings;
        if (!mounted) return;
        dispatch(hydrateSettings(nextSettings));
        dispatch(hydrateAccounts(accounts.map((item) => toStoredAccountSummary(item))));
      })
      .catch(() => {
        if (!mounted) return;
        dispatch(hydrateSettings({}));
        dispatch(hydrateAccounts([]));
      });

    return () => {
      mounted = false;
    };
  }, [dispatch]);

  /**
   * 同步鉴权状态：尝试恢复会话
   */
  const syncAuthState = useCallback(() => {
    if (booting || authReady) return;

    if (!backendUrl || !activeAccountId) {
      setAuthReady(false);
      setAuthChecking(false);
      return;
    }

    let cancelled = false;
    setAuthChecking(true);
    restoreSession(backendUrl, { silentBaseReset: true })
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
  }, [activeAccountId, authReady, backendUrl, booting]);

  // 监听端点变化，重新验证登录状态
  useEffect(() => {
    const cleanup = syncAuthState();
    return cleanup;
  }, [syncAuthState]);

  useEffect(() => {
    const unsubscribe = subscribeAuthSession((event) => {
      if (event.type === 'session_updated') {
        setAuthReady(true);
        setAuthChecking(false);
        return;
      }
      if (!accountSwitching) {
        setAuthReady(false);
        setAuthChecking(false);
      }
    });
    return () => unsubscribe();
  }, [accountSwitching]);

  useEffect(() => {
    if (booting || accountSwitching) {
      return;
    }
    if (!getCurrentSession() && !activeAccountId) {
      setAuthReady(false);
      setAuthChecking(false);
    }
  }, [activeAccountId, accountSwitching, booting]);

  const isBootPhase = booting || (!authReady && authChecking);
  const isLoginPhase = !isBootPhase && !authReady;
  const isShellPhase = !isBootPhase && authReady;
  const bootMessage = booting ? '正在加载配置...' : accountSwitching ? '正在切换账号...' : '正在验证登录状态...';

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
