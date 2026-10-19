import { downloadAuthenticatedResourceFile } from './authenticatedResourceFile.native';
import { Directory, File } from 'expo-file-system';

import {
  normalizeAuthenticatedResourceFileName,
  resolveAuthenticatedResourceSource,
  type AuthenticatedResourceDownloadRequest,
  type AuthenticatedResourceDownloadResult
} from './authenticatedResource.ts';

export async function downloadAuthenticatedResource(
  request: AuthenticatedResourceDownloadRequest
): Promise<AuthenticatedResourceDownloadResult> {
  await resolveAuthenticatedResourceSource(request.resourceUrl);
  const fileName = normalizeAuthenticatedResourceFileName(request.fileName);
  const directory = await Directory.pickDirectoryAsync();
  const destination = new File(directory, fileName);
  await downloadAuthenticatedResourceFile(request.resourceUrl, destination);
  return { fileName };
}
