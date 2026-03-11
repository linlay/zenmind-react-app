export type DrivePreviewKind =
  | 'directory'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'markdown'
  | 'text'
  | 'download'
  | 'unknown';

export interface DriveMount {
  id: string;
  name: string;
  path: string;
}

export interface DriveEntry {
  mountId: string;
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  modTime: number;
  mime: string;
  extension: string;
}

export interface DrivePreviewMeta {
  mountId: string;
  path: string;
  name: string;
  kind: DrivePreviewKind;
  mime: string;
  size: number;
  modTime: number;
  content?: string;
  streamUrl?: string;
}

export interface DriveEditorDocument {
  mountId: string;
  path: string;
  name: string;
  content: string;
  language: string;
  version: string;
}

export interface DriveTaskItem {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
}

export interface DriveTask {
  id: string;
  kind: 'upload' | 'download';
  status: 'pending' | 'running' | 'success' | 'failed';
  detail: string;
  items?: DriveTaskItem[];
  totalBytes?: number;
  completedBytes?: number;
  downloadUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DriveTrashItem {
  id: string;
  mountId: string;
  originalPath: string;
  trashPath: string;
  deletedAt: number;
  isDir: boolean;
  size: number;
  name: string;
}

export interface DriveSearchHit {
  mountId: string;
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  modTime: number;
  mime: string;
}

export type DriveUploadAsset = File | { uri: string; name: string; type?: string; size?: number };

