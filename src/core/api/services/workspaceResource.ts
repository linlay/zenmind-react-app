export type WorkspaceFileResourceRequest = {
  agentKey: string;
  filePath: string;
  line?: number | null;
};

const WORKSPACE_FILE_PATH = '/api/workspace/file';

export function buildWorkspaceFileResourceUrl(request: WorkspaceFileResourceRequest): string | null {
  const agentKey = String(request.agentKey || '').trim();
  const filePath = String(request.filePath || '').trim();
  if (!agentKey || !filePath) {
    return null;
  }

  const query = new URLSearchParams({ agentKey, path: filePath });
  const line = Math.floor(Number(request.line));
  if (Number.isFinite(line) && line > 0) {
    query.set('line', String(line));
  }
  return `${WORKSPACE_FILE_PATH}?${query.toString()}`;
}
