import { buildWorkspaceFileResourceUrl } from '../../../core/api/services/workspaceResource.ts';
import {
  isAuthenticatedResourceTextFileName,
  resolveAuthenticatedResourcePreviewKind,
  type AuthenticatedResourcePreviewKind
} from '../authenticatedResourcePreview.ts';

export type ConversationMarkdownInternalLink =
  | {
      kind: 'resource';
      href: string;
      filePath: string;
      fileName: string;
    }
  | {
      kind: 'workspace';
      href: string;
      filePath: string;
      fileName: string;
      line?: number;
    }
  | {
      kind: 'invalid';
      href: string;
      target: 'resource' | 'workspace';
    };

export type ConversationMarkdownLinkPreview = {
  key: string;
  name: string;
  resourceUrl: string;
  previewKind: AuthenticatedResourcePreviewKind;
  sourcePath?: string;
  line?: number;
  errorCode?: 'invalid' | 'missing_agent_scope';
};

const MAX_LINK_LENGTH = 4_096;
const MAX_LINE_NUMBER = 1_000_000;
const INTERNAL_ORIGIN = 'https://conversation-link.invalid';
const RESOURCE_PATH = '/api/resource';
const WORKSPACE_FILE_PATH = '/api/workspace/file';
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f]/;

function fileNameFromPath(filePath: string, fallback: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).at(-1) || fallback;
}

function hasSafePathSegments(filePath: string): boolean {
  return !filePath.split('/').some((segment) => segment === '.' || segment === '..');
}

function isSafeResourcePath(filePath: string): boolean {
  return Boolean(
    filePath &&
    filePath.length <= MAX_LINK_LENGTH &&
    !filePath.startsWith('/') &&
    !filePath.includes('\\') &&
    !CONTROL_CHARACTER_RE.test(filePath) &&
    hasSafePathSegments(filePath)
  );
}

function normalizeLine(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const line = Math.floor(Number(value));
  return Number.isFinite(line) && line > 0 && line <= MAX_LINE_NUMBER ? line : undefined;
}

function stripLineSuffix(filePath: string): { filePath: string; line?: number } {
  const match = /^(.*?):(\d+)(?::\d+)?$/.exec(filePath);
  if (!match) {
    return { filePath };
  }
  const line = normalizeLine(match[2]);
  return line ? { filePath: match[1], line } : { filePath };
}

function hasWorkspaceFileExtension(filePath: string): boolean {
  return isAuthenticatedResourceTextFileName(fileNameFromPath(filePath, ''));
}

function looksLikeWorkspacePath(filePath: string): boolean {
  const absolute = filePath.startsWith('/') && !filePath.startsWith('//');
  const relative = ['./', 'src/', 'docs/', 'public/', 'scripts/'].some((prefix) => filePath.startsWith(prefix));
  return absolute || relative;
}

function isSafeWorkspacePath(filePath: string): boolean {
  return Boolean(
    filePath &&
    filePath.length <= MAX_LINK_LENGTH &&
    !filePath.includes('\\') &&
    !CONTROL_CHARACTER_RE.test(filePath) &&
    hasSafePathSegments(filePath) &&
    looksLikeWorkspacePath(filePath) &&
    hasWorkspaceFileExtension(filePath)
  );
}

function parseInternalApiLink(href: string): ConversationMarkdownInternalLink | null {
  if (!href.startsWith('/') || href.startsWith('//')) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(href, INTERNAL_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== INTERNAL_ORIGIN) {
    return null;
  }

  if (url.pathname === RESOURCE_PATH) {
    const filePath = url.searchParams.get('file')?.trim() || '';
    return isSafeResourcePath(filePath)
      ? {
          kind: 'resource',
          href,
          filePath,
          fileName: fileNameFromPath(filePath, 'resource')
        }
      : { kind: 'invalid', href, target: 'resource' };
  }

  if (url.pathname === WORKSPACE_FILE_PATH) {
    const filePath = url.searchParams.get('path')?.trim() || '';
    const rawLine = url.searchParams.get('line');
    const line = normalizeLine(rawLine);
    return isSafeWorkspacePath(filePath) && (!rawLine || line)
      ? {
          kind: 'workspace',
          href,
          filePath,
          fileName: fileNameFromPath(filePath, 'workspace-file'),
          ...(line ? { line } : {})
        }
      : { kind: 'invalid', href, target: 'workspace' };
  }
  return null;
}

function parseWorkspacePathLink(href: string): ConversationMarkdownInternalLink | null {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//') || href.includes('?') || href.includes('#')) {
    return null;
  }

  let decodedHref: string;
  try {
    decodedHref = decodeURIComponent(href);
  } catch {
    return { kind: 'invalid', href, target: 'workspace' };
  }
  const parsed = stripLineSuffix(decodedHref);
  const filePath = parsed.filePath.trim();
  if (!isSafeWorkspacePath(filePath)) {
    return looksLikeWorkspacePath(filePath) && hasWorkspaceFileExtension(filePath)
      ? { kind: 'invalid', href, target: 'workspace' }
      : null;
  }
  return {
    kind: 'workspace',
    href,
    filePath,
    fileName: fileNameFromPath(filePath, 'workspace-file'),
    ...(parsed.line ? { line: parsed.line } : {})
  };
}

export function parseConversationMarkdownInternalLink(value: unknown): ConversationMarkdownInternalLink | null {
  const href = String(value || '').trim();
  if (!href || href.length > MAX_LINK_LENGTH) {
    return null;
  }
  return parseInternalApiLink(href) || parseWorkspacePathLink(href);
}

export function resolveConversationMarkdownLinkPreview(
  link: ConversationMarkdownInternalLink,
  agentKey: string
): ConversationMarkdownLinkPreview {
  if (link.kind === 'invalid') {
    return {
      key: `${link.target}:${link.href}`,
      name: link.target === 'resource' ? 'resource' : 'workspace-file',
      resourceUrl: '',
      previewKind: 'unsupported',
      errorCode: 'invalid'
    };
  }
  if (link.kind === 'resource') {
    return {
      key: `resource:${link.filePath}`,
      name: link.fileName,
      resourceUrl: link.href,
      previewKind: resolveAuthenticatedResourcePreviewKind({ name: link.fileName }),
      sourcePath: link.filePath
    };
  }

  const resourceUrl = buildWorkspaceFileResourceUrl({
    agentKey,
    filePath: link.filePath,
    line: link.line
  });
  return {
    key: `workspace:${link.filePath}:${link.line || ''}`,
    name: link.fileName,
    resourceUrl: resourceUrl || '',
    previewKind: 'text',
    sourcePath: link.filePath,
    line: link.line,
    ...(resourceUrl ? {} : { errorCode: 'missing_agent_scope' as const })
  };
}
