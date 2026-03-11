import { DriveEditorDocument, DriveEntry, DrivePreviewMeta } from '../../../../modules/drive/types';

export interface DriveContentProps {
  testIDPrefix?: string;
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
