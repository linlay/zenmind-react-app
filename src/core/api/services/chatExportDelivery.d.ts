import type { ChatExportFile } from './chatExportProtocol.ts';

export function deliverChatExport(file: ChatExportFile, action: 'save' | 'share', signal: AbortSignal): Promise<void>;
