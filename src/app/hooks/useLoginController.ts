import { useCallback, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { applyEndpointDraft, setEndpointDraft, setPtyUrlDraft } from '../../modules/user/state/userSlice';
import { normalizeEndpointInput, toBackendBaseUrl, toDefaultPtyWebUrl } from '../../core/network/endpoint';
import { getDefaultDeviceName, loginWithMasterPassword } from '../../core/auth/appAuth';
import { formatError } from '../../core/network/apiClient';
import { getAppVersionLabel } from '../../shared/utils/appVersion';
import type { AppTheme } from '../../core/constants/theme';

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
  theme: AppTheme;
  isSubmitting: boolean;

  // 方法
  setEndpointDraftText: (value: string) => void;
  setDeviceName: (value: string) => void;
  setMasterPassword: (value: string) => void;
  setAuthError: (value: string) => void;
  submitLogin: () => Promise<{ success: boolean }>;
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
export function useLoginController(theme: AppTheme): LoginController {
  const dispatch = useAppDispatch();
  const endpointDraft = useAppSelector((state) => state.user.endpointDraft);
  const [masterPassword, setMasterPassword] = useState('');
  const [deviceName, setDeviceName] = useState(getDefaultDeviceName());
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedLoginEndpointDraft = normalizeEndpointInput(endpointDraft);
  const canSubmitLogin = Boolean(normalizedLoginEndpointDraft) && !isSubmitting;
  const appVersionLabel = getAppVersionLabel();

  /**
   * 提交登录表单
   * 1. 验证端点和密码输入
   * 2. 更新端点和 PTY URL 配置到 Redux
   * 3. 调用登录 API
   * 4. 登录成功后清空密码并返回 { success: true }
   * 5. 登录失败则显示错误信息并返回 { success: false }
   */
  const submitLogin = useCallback(async (): Promise<{ success: boolean }> => {
    const normalizedEndpoint = normalizeEndpointInput(endpointDraft);
    if (!normalizedEndpoint) {
      setAuthError('请输入后端域名或 IP');
      return { success: false };
    }

    const password = String(masterPassword || '').trim();
    if (!password) {
      setAuthError('请输入主密码');
      return { success: false };
    }

    const loginBackendUrl = toBackendBaseUrl(normalizedEndpoint);
    if (!loginBackendUrl) {
      setAuthError('后端地址格式无效');
      return { success: false };
    }

    // 更新 Redux 端点配置
    dispatch(setEndpointDraft(normalizedEndpoint));
    dispatch(setPtyUrlDraft(toDefaultPtyWebUrl(normalizedEndpoint)));
    dispatch(applyEndpointDraft());

    setIsSubmitting(true);
    setAuthError('');
    try {
      await loginWithMasterPassword(loginBackendUrl, password, deviceName);
      setMasterPassword(''); // 登录成功后清空密码
      return { success: true };
    } catch (error) {
      setAuthError(formatError(error));
      return { success: false };
    } finally {
      setIsSubmitting(false);
    }
  }, [deviceName, dispatch, endpointDraft, masterPassword]);

  const setEndpointDraftText = useCallback(
    (value: string) => {
      dispatch(setEndpointDraft(value));
    },
    [dispatch]
  );

  return {
    endpointDraft,
    deviceName,
    masterPassword,
    authError,
    canSubmitLogin,
    appVersionLabel,
    theme,
    isSubmitting,
    setEndpointDraftText,
    setDeviceName,
    setMasterPassword,
    setAuthError,
    submitLogin,
  };
}
