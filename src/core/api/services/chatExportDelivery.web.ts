import { ChatExportError, type ChatExportFile } from './chatExportProtocol.ts';

export async function deliverChatExport(
  file: ChatExportFile,
  action: 'save' | 'share',
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) throw new ChatExportError('cancelled');
  const blob = new Blob([file.bytes], { type: file.mimeType });
  if (action === 'share') {
    const files = [new File([blob], file.fileName, { type: file.mimeType })];
    if (!navigator.canShare?.({ files })) throw new ChatExportError('unavailable');
    await navigator.share({ files });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = file.fileName;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
