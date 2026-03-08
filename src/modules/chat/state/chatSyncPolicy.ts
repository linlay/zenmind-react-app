export function shouldApplyChatSyncResult(updatedChatIds: string[]): boolean {
  return Array.isArray(updatedChatIds) && updatedChatIds.length > 0;
}
