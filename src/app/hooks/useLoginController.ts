import { useCallback, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  applyEndpointDraft,
  setActiveAccountId,
  setAccountSwitching,
  setEndpointDraft,
  setPtyUrlDraft,
  setSavedAccounts
} from '../../modules/user/state/userSlice';
import {
  getActiveStoredAccount,
  getDefaultDeviceName,
  listStoredAccounts,
  loginWithMasterPassword,
  removeStoredAccount,
  switchActiveAccount
} from '../../core/auth/appAuth';
import { resolveLoginSubmission } from '../../core/auth/loginSubmission';
import { formatError } from '../../core/network/apiClient';
import { getAppVersionLabel } from '../../shared/utils/appVersion';
import { StoredAccountSummary } from '../../core/types/common';

/**
 * 登录控制器接口
 */
export interface LoginController {
  // 状态
  endpointDraft: string;
  deviceName: string;
  masterPassword: string;
  authError: string;
  canSubmitLogin: boolean;
  appVersionLabel: string;
  isSubmitting: boolean;
  savedAccounts: StoredAccountSummary[];
  activeAccountId: string;
  isSwitchingAccount: boolean;

  // 方法
  setEndpointDraftText: (value: string) => void;
  setDeviceName: (value: string) => void;
  setMasterPassword: (value: string) => void;
  setAuthError: (value: string) => void;
  submitLogin: () => Promise<{ success: boolean }>;
  switchToSavedAccount: (accountId: string) => Promise<{ success: boolean }>;
  removeSavedAccount: (accountId: string) => Promise<void>;
}

/**
 * 登录控制器 Hook
 *
 * 职责：
 * - 管理登录表单状态（端点、设备名、密码、错误信息）
 * - 处理登录提交逻辑
 * - 提供版本信息
 *
 * 注意：登录成功后，需要外部调用 restoreSession 来刷新数据
 */
export function useLoginController(): LoginController {
  const dispatch = useAppDispatch();
  const { endpointDraft, savedAccounts, activeAccountId, accountSwitching } = useAppSelector((state) => state.user);
  const [masterPassword, setMasterPassword] = useState('');
  const [deviceName, setDeviceName] = useState(getDefaultDeviceName());
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedLoginEndpointDraft = String(endpointDraft || '').trim();
  const canSubmitLogin = Boolean(normalizedLoginEndpointDraft) && !isSubmitting && !accountSwitching;
  const appVersionLabel = getAppVersionLabel();

  const refreshStoredAccountsState = useCallback(async () => {
    const [accounts, activeAccount] = await Promise.all([listStoredAccounts(), getActiveStoredAccount()]);
    dispatch(setSavedAccounts(accounts));
    dispatch(setActiveAccountId(activeAccount?.accountId || ''));
    return { accounts, activeAccount };
  }, [dispatch]);

  /**
   * 提交登录表单
   * 1. 验证端点和密码输入
   * 2. 更新端点和 PTY URL 配置到 Redux
   * 3. 调用登录 API
   * 4. 登录成功后清空密码并返回 { success: true }
   * 5. 登录失败则显示错误信息并返回 { success: false }
   */
  const submitLogin = useCallback(async (): Promise<{ success: boolean }> => {
    const resolved = resolveLoginSubmission({
      endpointDraft,
      masterPassword,
      deviceName
    });
    if (!resolved.ok) {
      setAuthError(String(resolved.error || '登录参数无效'));
      return { success: false };
    }

    // 更新 Redux 端点配置
    dispatch(setEndpointDraft(resolved.normalizedEndpoint || ''));
    dispatch(setPtyUrlDraft(resolved.ptyUrl || ''));
    dispatch(applyEndpointDraft());

    setIsSubmitting(true);
    setAuthError('');
    try {
      await loginWithMasterPassword(resolved.backendUrl || '', resolved.password || '', resolved.deviceName || deviceName);
      await refreshStoredAccountsState();
      setMasterPassword(''); // 登录成功后清空密码
      return { success: true };
    } catch (error) {
      setAuthError(formatError(error));
      return { success: false };
    } finally {
      setIsSubmitting(false);
    }
  }, [deviceName, dispatch, endpointDraft, masterPassword, refreshStoredAccountsState]);

  const setEndpointDraftText = useCallback(
    (value: string) => {
      dispatch(setEndpointDraft(value));
    },
    [dispatch]
  );

  const switchToSavedAccount = useCallback(
    async (accountId: string): Promise<{ success: boolean }> => {
      const target = savedAccounts.find((item) => item.accountId === accountId);
      if (!target) {
        setAuthError('选中的账号不存在');
        return { success: false };
      }

      dispatch(setAccountSwitching(true));
      dispatch(setActiveAccountId(target.accountId));
      dispatch(setEndpointDraft(target.endpointInput));
      dispatch(setPtyUrlDraft(target.ptyUrlInput));
      dispatch(applyEndpointDraft());
      setAuthError('');

      try {
        const session = await switchActiveAccount(target.accountId);
        await refreshStoredAccountsState();
        if (!session) {
          setAuthError('保存的登录凭证已失效，请重新登录');
          return { success: false };
        }
        return { success: true };
      } catch (error) {
        setAuthError(formatError(error));
        return { success: false };
      } finally {
        dispatch(setAccountSwitching(false));
      }
    },
    [dispatch, refreshStoredAccountsState, savedAccounts]
  );

  const removeSavedAccountAction = useCallback(
    async (accountId: string) => {
      const accounts = await removeStoredAccount(accountId);
      dispatch(setSavedAccounts(accounts));
      if (accountId === activeAccountId) {
        dispatch(setActiveAccountId(''));
      }
    },
    [activeAccountId, dispatch]
  );

  return {
    endpointDraft,
    deviceName,
    masterPassword,
    authError,
    canSubmitLogin,
    appVersionLabel,
    isSubmitting,
    savedAccounts,
    activeAccountId,
    isSwitchingAccount: accountSwitching,
    setEndpointDraftText,
    setDeviceName,
    setMasterPassword,
    setAuthError,
    submitLogin,
    switchToSavedAccount,
    removeSavedAccount: removeSavedAccountAction
  };
}
