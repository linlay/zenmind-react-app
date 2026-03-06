import { ShellThemeTabScreenProps } from "../../types";

export interface ShellUserTabScreenProps extends ShellThemeTabScreenProps {
  onSettingsApplied: () => void;
  username: string;
  deviceName: string;
  accessToken: string;
  versionLabel: string;
  onLogout: () => void;
}
