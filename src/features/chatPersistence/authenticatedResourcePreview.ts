import { getChatAttachmentExtension, getChatAttachmentKind } from './chatAttachmentModels.ts';

export type AuthenticatedResourcePreviewKind = 'image' | 'text' | 'pdf' | 'unsupported';

export type AuthenticatedResourceTextSections = {
  before: string;
  target: string;
  after: string;
};

const TEXT_EXTENSIONS = new Set([
  'c',
  'cc',
  'cpp',
  'cs',
  'css',
  'csv',
  'go',
  'html',
  'htm',
  'ini',
  'java',
  'js',
  'json',
  'jsx',
  'less',
  'log',
  'md',
  'mdx',
  'mjs',
  'py',
  'rb',
  'rs',
  'sass',
  'scss',
  'sh',
  'sql',
  'svg',
  'toml',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml'
]);

export function isAuthenticatedResourceTextFileName(name: string | null | undefined): boolean {
  return TEXT_EXTENSIONS.has(getChatAttachmentExtension(name));
}

export function resolveAuthenticatedResourcePreviewKind(input: {
  name?: string | null;
  mimeType?: string | null;
}): AuthenticatedResourcePreviewKind {
  const mimeType = String(input.mimeType || '')
    .trim()
    .toLowerCase()
    .split(';', 1)[0];
  const extension = getChatAttachmentExtension(input.name);
  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return 'pdf';
  }
  if (getChatAttachmentKind({ name: input.name, mimeType }) === 'image') {
    return 'image';
  }
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/xml' ||
    mimeType.endsWith('+json') ||
    mimeType.endsWith('+xml') ||
    isAuthenticatedResourceTextFileName(input.name)
  ) {
    return 'text';
  }
  return 'unsupported';
}

export function splitAuthenticatedResourceTextAtLine(
  text: string,
  line: number | null | undefined
): AuthenticatedResourceTextSections | null {
  const targetLine = Math.floor(Number(line));
  if (!Number.isFinite(targetLine) || targetLine < 1) {
    return null;
  }

  let currentLine = 1;
  let lineStart = 0;
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index];
    const atLineEnd = index === text.length || character === '\n' || character === '\r';
    if (!atLineEnd) {
      continue;
    }
    if (currentLine === targetLine) {
      const newlineLength = character === '\r' && text[index + 1] === '\n' ? 2 : character ? 1 : 0;
      let beforeEnd = lineStart;
      if (beforeEnd > 0 && text[beforeEnd - 1] === '\n') {
        beforeEnd -= 1;
      }
      if (beforeEnd > 0 && text[beforeEnd - 1] === '\r') {
        beforeEnd -= 1;
      }
      return {
        before: text.slice(0, beforeEnd),
        target: text.slice(lineStart, index),
        after: text.slice(index + newlineLength)
      };
    }
    if (character === '\r' && text[index + 1] === '\n') {
      index += 1;
    }
    currentLine += 1;
    lineStart = index + 1;
  }
  return null;
}
