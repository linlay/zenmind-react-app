export function parseErrorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const value = payload as Record<string, unknown>;
    if (typeof value.error === 'string' && value.error.trim()) {
      return value.error;
    }
    if (typeof value.msg === 'string' && value.msg.trim()) {
      return value.msg;
    }
    if (typeof value.message === 'string' && value.message.trim()) {
      return value.message;
    }
  }
  return `HTTP ${status}`;
}
