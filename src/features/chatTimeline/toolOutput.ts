export const TOOL_OUTPUT_MAX_BYTES = 64 * 1024;
export const CONVERSATION_TOOL_OUTPUT_MAX_BYTES = 256 * 1024;
const TRUNCATION_MARKER = '\n… [output truncated] …\n';
export type ChatToolOutput = {
  stdout: string;
  stderr: string;
  bytes: number;
  lastChunkIndex: number;
  stdoutAnsiTail?: string;
  stderrAnsiTail?: string;
};

function utf8Size(code: number): number {
  return code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
}
export function toolOutputUtf8Bytes(text: string): number {
  let size = 0;
  for (const character of text) size += utf8Size(character.codePointAt(0)!);
  return size;
}
function takeHead(text: string, budget: number): string {
  let end = 0;
  let bytes = 0;
  for (const character of text) {
    bytes += utf8Size(character.codePointAt(0)!);
    if (bytes > budget) break;
    end += character.length;
  }
  return text.slice(0, end);
}
function takeTail(text: string, budget: number): string {
  let start = text.length;
  let bytes = 0;
  while (start > 0) {
    let index = start - 1;
    const unit = text.charCodeAt(index);
    if (unit >= 0xdc00 && unit <= 0xdfff && index > 0) index -= 1;
    bytes += utf8Size(text.codePointAt(index)!);
    if (bytes > budget) break;
    start = index;
  }
  return text.slice(start);
}
function boundText(text: string, budget: number): string {
  if (toolOutputUtf8Bytes(text) <= budget) return text;
  const contentBudget = budget - toolOutputUtf8Bytes(TRUNCATION_MARKER);
  if (contentBudget <= 0) return takeTail(text, budget);
  const half = Math.floor(contentBudget / 2);
  return takeHead(text, half) + TRUNCATION_MARKER + takeTail(text, contentBudget - half);
}
export function appendChatToolOutput(
  current: ChatToolOutput | undefined,
  event: Record<string, unknown>,
  budget: number
): ChatToolOutput | undefined {
  const stream = event.stream;
  if (
    (stream !== 'stdout' && stream !== 'stderr') ||
    typeof event.delta !== 'string' ||
    !Number.isSafeInteger(event.chunkIndex) ||
    Number(event.chunkIndex) < 0 ||
    Number(event.chunkIndex) <= (current?.lastChunkIndex ?? -1) ||
    budget <= 0
  )
    return current;
  // Carry only an incomplete escape prefix across chunks. OSC payloads are
  // discarded immediately, so even a never-terminated control stays bounded.
  const tailKey = stream === 'stdout' ? 'stdoutAnsiTail' : 'stderrAnsiTail';
  const combined = (current?.[tailKey] || '') + event.delta;
  const tailMatch = /\u001b(?:\][^\u0007\u001b]*|\[[0-?]*[ -/]*|)$/.exec(combined);
  const tail = tailMatch?.[0] || '';
  const clean = tail ? combined.slice(0, combined.length - tail.length) : combined;
  const text = clean
    .replace(/\u001b\][^\u0007]*(?:\u0007|$)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]?/g, '')
    .replace(/\u001b./g, '');
  const next: ChatToolOutput = {
    ...current,
    stdout: current?.stdout || '',
    stderr: current?.stderr || '',
    bytes: 0,
    lastChunkIndex: Number(event.chunkIndex)
  };
  next[tailKey] = tail.startsWith('\u001b]') ? '\u001b]' : tail.slice(0, 128);
  const other = stream === 'stdout' ? 'stderr' : 'stdout';
  const available = Math.min(Math.floor(TOOL_OUTPUT_MAX_BYTES / 2), budget - toolOutputUtf8Bytes(next[other]));
  next[stream] = boundText(next[stream] + text, Math.max(0, available));
  next.bytes = toolOutputUtf8Bytes(next.stdout) + toolOutputUtf8Bytes(next.stderr);
  return next;
}
