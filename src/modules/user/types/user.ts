import { AppSettings, StoredAccountSummary } from '../../../core/types/common';

export interface UserState extends AppSettings {
  booting: boolean;
  endpointDraft: string;
  ptyUrlDraft: string;
  savedAccounts: StoredAccountSummary[];
  accountSwitching: boolean;
}
