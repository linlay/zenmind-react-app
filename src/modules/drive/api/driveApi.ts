import { authorizedFetch } from '../../../core/auth/appAuth';
import { fetchAuthedJson } from '../../../core/network/apiClient';
import { parseErrorMessage } from '../../../core/network/errorUtils';
import {
  DriveEditorDocument,
  DriveEntry,
  DriveMount,
  DrivePreviewMeta,
  DriveSearchHit,
  DriveTask,
  DriveTrashItem,
  DriveUploadAsset
} from '../types';

function buildSearchParams(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });
  return search.toString();
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const bodyText = await response.text();
  let payload: unknown = null;
  if (bodyText) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      throw new Error(`Invalid JSON response: ${bodyText.slice(0, 180)}`);
    }
  }

  if (!response.ok) {
    throw new Error(parseErrorMessage(response.status, payload));
  }

  return payload as T;
}

export function buildDriveRawFilePath(mountId: string, path: string): string {
  const query = buildSearchParams({ mountId, path });
  return `/api/files/raw?${query}`;
}

export function buildDriveTaskDownloadPath(taskId: string): string {
  return `/api/tasks/${encodeURIComponent(taskId)}/download`;
}

export function buildAbsoluteDriveUrl(baseUrl: string, relativePath: string): string {
  return new URL(relativePath, `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

export async function listDriveMounts(baseUrl: string): Promise<DriveMount[]> {
  return fetchAuthedJson<DriveMount[]>(baseUrl, '/api/mounts');
}

export async function listDriveFiles(
  baseUrl: string,
  mountId: string,
  path: string,
  showHidden: boolean
): Promise<DriveEntry[]> {
  const query = buildSearchParams({ mountId, path, showHidden: showHidden ? 1 : 0 });
  return fetchAuthedJson<DriveEntry[]>(baseUrl, `/api/files?${query}`);
}

export async function searchDriveFiles(baseUrl: string, queryText: string, showHidden: boolean): Promise<DriveSearchHit[]> {
  const query = buildSearchParams({ q: queryText, showHidden: showHidden ? 1 : 0 });
  return fetchAuthedJson<DriveSearchHit[]>(baseUrl, `/api/search?${query}`);
}

export async function getDrivePreview(baseUrl: string, mountId: string, path: string): Promise<DrivePreviewMeta> {
  const query = buildSearchParams({ mountId, path });
  return fetchAuthedJson<DrivePreviewMeta>(baseUrl, `/api/preview?${query}`);
}

export async function getDriveFileContent(baseUrl: string, mountId: string, path: string): Promise<DriveEditorDocument> {
  const query = buildSearchParams({ mountId, path });
  return fetchAuthedJson<DriveEditorDocument>(baseUrl, `/api/files/content?${query}`);
}

export async function createDriveFolder(
  baseUrl: string,
  payload: { mountId: string; path: string; name: string }
): Promise<DriveEntry> {
  return fetchAuthedJson<DriveEntry>(baseUrl, '/api/files/folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function renameDriveEntry(
  baseUrl: string,
  payload: { mountId: string; path: string; newName: string }
): Promise<DriveEntry> {
  return fetchAuthedJson<DriveEntry>(baseUrl, '/api/files/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function moveDriveEntry(
  baseUrl: string,
  payload: { mountId: string; path: string; targetDir: string }
): Promise<DriveEntry> {
  return fetchAuthedJson<DriveEntry>(baseUrl, '/api/files/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function copyDriveEntry(
  baseUrl: string,
  payload: { mountId: string; path: string; targetDir: string }
): Promise<DriveEntry> {
  return fetchAuthedJson<DriveEntry>(baseUrl, '/api/files/copy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteDriveEntry(baseUrl: string, payload: { mountId: string; path: string }): Promise<{ ok: boolean }> {
  return fetchAuthedJson<{ ok: boolean }>(baseUrl, '/api/files/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function listDriveTasks(baseUrl: string): Promise<DriveTask[]> {
  return fetchAuthedJson<DriveTask[]>(baseUrl, '/api/tasks');
}

export async function getDriveTask(baseUrl: string, taskId: string): Promise<DriveTask> {
  return fetchAuthedJson<DriveTask>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`);
}

export async function createDriveBatchDownload(
  baseUrl: string,
  payload: { mountId: string; items: string[]; archiveName: string }
): Promise<DriveTask> {
  return fetchAuthedJson<DriveTask>(baseUrl, '/api/downloads/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteDriveTask(baseUrl: string, taskId: string): Promise<{ ok: boolean }> {
  const response = await authorizedFetch(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE'
  });
  return parseJsonResponse<{ ok: boolean }>(response);
}

export async function listDriveTrash(baseUrl: string): Promise<DriveTrashItem[]> {
  return fetchAuthedJson<DriveTrashItem[]>(baseUrl, '/api/trash');
}

export async function restoreDriveTrash(
  baseUrl: string,
  payload: { ids: string[] }
): Promise<{ restored: number; conflicts: string[] }> {
  return fetchAuthedJson<{ restored: number; conflicts: string[] }>(baseUrl, '/api/trash/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteDriveTrash(
  baseUrl: string,
  payload: { ids: string[] }
): Promise<{ deleted: number; missing: string[] }> {
  return fetchAuthedJson<{ deleted: number; missing: string[] }>(baseUrl, '/api/trash/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function uploadDriveFiles(
  baseUrl: string,
  mountId: string,
  path: string,
  files: DriveUploadAsset[]
): Promise<DriveTask> {
  const formData = new FormData();
  formData.append('mountId', mountId);
  formData.append('path', path);
  files.forEach((file) => {
    formData.append('files', file as unknown as Blob);
  });

  const response = await authorizedFetch(baseUrl, '/api/uploads', {
    method: 'POST',
    body: formData
  });
  return parseJsonResponse<DriveTask>(response);
}

export async function fetchDriveBlob(baseUrl: string, relativePath: string): Promise<Blob> {
  const response = await authorizedFetch(baseUrl, relativePath);
  if (!response.ok) {
    const bodyText = await response.text();
    let payload: unknown = null;
    if (bodyText) {
      try {
        payload = JSON.parse(bodyText);
      } catch {
        payload = null;
      }
    }
    throw new Error(parseErrorMessage(response.status, payload));
  }
  return response.blob();
}

