export type SubmitFrontendToolRequest = {
  chatId?: string;
  runId: string;
  agentKey?: string;
  teamId?: string;
  toolId: string;
  params: Record<string, unknown>;
};

export function buildSubmitFrontendToolPayload(
  request: SubmitFrontendToolRequest
): SubmitFrontendToolRequest {
  const chatId = String(request.chatId || '').trim();
  const teamId = String(request.teamId || '').trim();
  const agentKey = teamId ? '' : String(request.agentKey || '').trim();
  return {
    ...(chatId ? { chatId } : {}),
    runId: String(request.runId || '').trim(),
    ...(teamId ? { teamId } : {}),
    ...(agentKey ? { agentKey } : {}),
    toolId: String(request.toolId || '').trim(),
    params: request.params,
  };
}
