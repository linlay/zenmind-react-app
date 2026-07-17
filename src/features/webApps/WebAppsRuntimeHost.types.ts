import type {
  OpenableWebApp,
  WebAppItem,
  WebAppResident,
  WebAppResidentLoadState,
  WebAppsConnectionStatus
} from './types';

export type WebAppsRuntimeHostProps = {
  visible: boolean;
  selectorVisible: boolean;
  activeApp: WebAppItem | null;
  openableApps: readonly OpenableWebApp[];
  residents: readonly WebAppResident[];
  connectionStatus: WebAppsConnectionStatus;
  onBack: () => void;
  onOpenSelector: () => void;
  onCloseSelector: () => void;
  onSelectApp: (appId: string) => void;
  onResidentLoadState: (appId: string, generation: number, loadState: WebAppResidentLoadState) => void;
  onResidentTerminated: (appId: string, generation: number) => void;
  onResidentNavigation: (appId: string, url: string) => void;
  onRetryResident: (appId: string) => void;
};
