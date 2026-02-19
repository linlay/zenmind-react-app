import { AppSettings, ThemeMode } from '../../../core/types/common';

export interface UserState extends AppSettings {
  booting: boolean;
  endpointDraft: string;
  ptyUrlDraft: string;
  settingsOpen: boolean;
}

export interface ThemePayload {
  themeMode: ThemeMode;
}
