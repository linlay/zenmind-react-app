const SPECIAL_FENCE_HEADERS = ['```viewport', '```tts-voice'] as const;

export function normalizeMarkdownContent(content: string): string {
  return String(content || '').replace(/\r\n?/g, '\n');
}

function isFenceLine(line: string): boolean {
  return /^\s*(```+|~~~+)/.test(line);
}

function hasMarkdownTablePipe(line: string): boolean {
  return /(^|[^\\])\|/.test(line);
}

function isMarkdownTableSeparator(line: string): boolean {
  if (!hasMarkdownTablePipe(line)) {
    return false;
  }

  const cells = line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isMarkdownTableRow(line: string): boolean {
  return hasMarkdownTablePipe(line) && !isMarkdownTableSeparator(line);
}

export function removeEmptyMarkdownTables(content: string): string {
  const lines = normalizeMarkdownContent(content).split('\n');
  const output: string[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || '';

    if (isFenceLine(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }

    const nextLine = lines[index + 1] || '';
    const tableHasBody = isMarkdownTableRow(lines[index + 2] || '');
    if (
      !inFence &&
      isMarkdownTableRow(line) &&
      isMarkdownTableSeparator(nextLine) &&
      !tableHasBody
    ) {
      index += 1;
      continue;
    }

    output.push(line);
  }

  return output.join('\n');
}

function matchesPendingSpecialFenceHeader(rawHeader: string): boolean {
  const lower = String(rawHeader || '')
    .trimEnd()
    .toLowerCase();
  if (!lower.startsWith('```') || lower === '```') {
    return false;
  }

  return SPECIAL_FENCE_HEADERS.some(
    (header) =>
      header.startsWith(lower) ||
      lower === header ||
      lower.startsWith(`${header} `) ||
      lower.startsWith(`${header}\t`)
  );
}

function findPendingSpecialFenceTailStart(raw: string): number {
  let cursor = 0;

  while (cursor < raw.length) {
    const start = raw.indexOf('```', cursor);
    if (start === -1) {
      return -1;
    }

    if (start > 0 && raw[start - 1] !== '\n') {
      cursor = start + 3;
      continue;
    }

    const lineEnd = raw.indexOf('\n', start);
    if (lineEnd !== -1) {
      cursor = start + 3;
      continue;
    }

    return matchesPendingSpecialFenceHeader(raw.slice(start)) ? start : -1;
  }

  return -1;
}

export function stripPendingSpecialFenceTail(content: string): string {
  const raw = normalizeMarkdownContent(content);
  if (!raw) {
    return '';
  }

  const pendingStart = findPendingSpecialFenceTailStart(raw);
  if (pendingStart === -1) {
    return raw;
  }

  return raw.slice(0, pendingStart).replace(/[ \t]*\n?$/, '');
}

export function normalizeOrderedListMarkerSpacing(content: string): string {
  const lines = normalizeMarkdownContent(content).split('\n');
  const output: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }

    output.push(inFence ? line : line.replace(/^([ \t]{0,3})(\d{1,3})\.([^\s\d].*)$/, '$1$2. $3'));
  }

  return output.join('\n');
}

export function preprocessMarkdownContent(content: string): string {
  return removeEmptyMarkdownTables(
    normalizeOrderedListMarkerSpacing(stripPendingSpecialFenceTail(content))
  );
}

export const markdownPreprocessInternals = {
  isFenceLine,
  isMarkdownTableRow,
  isMarkdownTableSeparator,
};
