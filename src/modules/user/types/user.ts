import { AppSettings } from '../../../core/types/common';

export interface UserState extends AppSettings {
  booting: boolean;
  endpointDraft: string;
  ptyUrlDraft: string;
}
