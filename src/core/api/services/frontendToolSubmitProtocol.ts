import { buildChatRunOwnerPayload } from './chatRunOwner.ts';
export type SubmitFrontendToolRequest = {
  chatId?: string;
  runId: string;
  agentKey?: string;
  toolId: string;
  params: Record<string, unknown>;
};

export function buildSubmitFrontendToolPayload(request: SubmitFrontendToolRequest): SubmitFrontendToolRequest {
  const chatId = String(request.chatId || '').trim();
  return {
    ...(chatId ? { chatId } : {}),
    runId: String(request.runId || '').trim(),
    ...buildChatRunOwnerPayload(request),
    toolId: String(request.toolId || '').trim(),
    params: request.params
  };
}
