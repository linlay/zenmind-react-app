import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DriveEditorDocument, DriveEntry, DrivePreviewMeta } from '../../../../modules/drive/types';
import { ShellTabBindings } from '../../types';

export interface DriveContentProps {
  testIDPrefix?: string;
}

export type DriveStackParamList = {
  DriveBrowser: { mountId?: string; path?: string } | undefined;
  DriveSearch: undefined;
  DriveMenu: undefined;
  DriveTasks: undefined;
  DriveTrash: undefined;
  DrivePreview: undefined;
  DriveForm: undefined;
  DriveMoveCopyPicker: { path?: string; mountName?: string } | undefined;
};

export type DriveRouteName = keyof DriveStackParamList;
export type DriveRootNavigation = NativeStackNavigationProp<DriveStackParamList>;
export type DriveNavigation<RouteName extends DriveRouteName> = NativeStackNavigationProp<DriveStackParamList, RouteName>;
export type DriveRouteParams = DriveStackParamList[DriveRouteName];
export type DriveRouteFocusHandler = (routeName: DriveRouteName, params?: DriveRouteParams) => void;

export interface DriveRouteScreenProps<RouteName extends DriveRouteName> {
  navigation: DriveNavigation<RouteName>;
  route: RouteProp<DriveStackParamList, RouteName>;
}

export interface DriveRouteBridgeProps {
  onBindNavigation?: (navigation: DriveRootNavigation) => void;
  onRouteFocus?: DriveRouteFocusHandler;
}

export interface ShellDriveTabScreenProps extends ShellTabBindings {
  onBindNavigation?: (navigation: DriveRootNavigation) => void;
  onRouteFocus?: DriveRouteFocusHandler;
}

export interface PreviewPageState {
  entry: DriveEntry;
  loading: boolean;
  error: string;
  preview: DrivePreviewMeta | null;
  document: DriveEditorDocument | null;
  accessToken: string;
}

export interface EntryActionsPageState {
  entries: DriveEntry[];
}

export type DriveFormPageState =
  | {
    kind: 'create-folder';
    value: string;
    submitting: boolean;
    error: string;
  }
  | {
    kind: 'rename';
    entry: DriveEntry;
    value: string;
    submitting: boolean;
    error: string;
  }
  | {
    kind: 'move' | 'copy';
    entries: DriveEntry[];
    browsePath: string;
    targetPath: string;
    browseEntries: DriveEntry[];
    loading: boolean;
    submitting: boolean;
    error: string;
  }
  | {
    kind: 'delete';
    entries: DriveEntry[];
    submitting: boolean;
    error: string;
  }
  | {
    kind: 'batch-download';
    entries: DriveEntry[];
    value: string;
    submitting: boolean;
    error: string;
  };

export interface DrivePalette {
  pageBg: string;
  cardBg: string;
  cardBorder: string;
  iconTileBg: string;
  text: string;
  textSoft: string;
  textMute: string;
  primary: string;
  primaryDeep: string;
  primarySoft: string;
  danger: string;
  ok: string;
  overlay: string;
}
