import { Directory, File, Paths } from 'expo-file-system';
import { ChatExportError, type ChatExportFile } from './chatExportProtocol.ts';

/** Own exactly one temporary directory; keep its file until the system sheet settles. */
export async function deliverChatExport(
  file: ChatExportFile,
  action: 'save' | 'share',
  signal: AbortSignal
): Promise<void> {
  const check = () => {
    if (signal.aborted) throw new ChatExportError('cancelled');
  };
  check();
  if (action === 'save') {
    let directory: Directory;
    try {
      directory = await Directory.pickDirectoryAsync();
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
      if (code === 'ERR_PICKER_CANCELLED' || code === 'ERR_FILE_PICKING_CANCELLED')
        throw new ChatExportError('cancelled');
      throw error;
    }
    check();
    // A selected directory can contain user files. Never overwrite them.
    let name = file.fileName;
    if (new File(directory, name).exists) name = `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`;
    const destination = directory.createFile(name, file.mimeType);
    try {
      check();
      destination.write(file.bytes);
      check();
    } catch (error) {
      destination.delete();
      throw error;
    }
    return;
  }
  // Old native binaries may not contain ExpoSharing yet. Loading on tap preserves the rest of the app.
  let sharing: typeof import('expo-sharing');
  try {
    sharing = await import('expo-sharing');
  } catch {
    throw new ChatExportError('unavailable');
  }
  if (!(await sharing.isAvailableAsync())) throw new ChatExportError('unavailable');
  check();
  const directory = new Directory(Paths.cache, `chat-export-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  directory.create();
  try {
    const destination = new File(directory, file.fileName);
    destination.create();
    destination.write(file.bytes);
    check();
    await sharing.shareAsync(destination.uri, {
      mimeType: file.mimeType,
      UTI: file.mimeType === 'text/html' ? 'public.html' : 'net.daringfireball.markdown'
    });
  } finally {
    if (directory.exists) directory.delete();
  }
}
