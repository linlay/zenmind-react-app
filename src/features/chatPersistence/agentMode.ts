export function normalizeAgentMode(value: unknown): string | null {
  const mode = String(value || '')
    .trim()
    .toUpperCase();
  return mode || null;
}
