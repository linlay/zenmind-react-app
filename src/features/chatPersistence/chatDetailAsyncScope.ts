export function shouldApplyChatDetailAsyncResult(input: {
  activeConversationId: string;
  targetConversationId: string;
  currentRequestId: number;
  requestId: number;
}): boolean {
  return (
    input.activeConversationId === input.targetConversationId &&
    input.currentRequestId === input.requestId
  );
}
