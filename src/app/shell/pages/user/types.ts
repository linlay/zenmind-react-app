import { StoredAccountSummary } from '../../../../core/types/common';
import { ShellThemeTabScreenProps } from '../../types';

export interface ShellUserTabScreenProps extends ShellThemeTabScreenProps {
  onSettingsApplied: () => void;
  username: string;
  deviceName: string;
  accessToken: string;
  versionLabel: string;
  savedAccounts: StoredAccountSummary[];
  activeAccountId: string;
  accountSwitching: boolean;
  loginEndpointDraft: string;
  loginDeviceName: string;
  loginMasterPassword: string;
  loginAuthError: string;
  canSubmitLogin: boolean;
  onClearChatCache: () => Promise<void>;
  onLogout: () => void;
  onSwitchAccount: (accountId: string) => Promise<{ success: boolean }>;
  onRemoveAccount: (accountId: string) => Promise<void>;
  onSetLoginEndpointDraft: (value: string) => void;
  onSetLoginDeviceName: (value: string) => void;
  onSetLoginMasterPassword: (value: string) => void;
  onSetLoginAuthError: (value: string) => void;
  onSubmitLogin: () => Promise<void>;
}
