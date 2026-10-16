import { buildChatResourceUrl } from '../../../core/api/resourceUrl.ts';
import { isOfficeFile } from '../../../core/api/services/documentPreviewProtocol.ts';
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
  const name = fileNameFromPath(filePath, '');
  return isAuthenticatedResourceTextFileName(name) || isOfficeFile(name);
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
  if (href.startsWith('/api/') || href.startsWith('/ap/api/')) return null;
  if (/^@workspace\//i.test(href)) {
    let filePath: string;
    try {
      filePath = decodeURIComponent(href.slice(11));
    } catch {
      return { kind: 'invalid', href, target: 'workspace' };
    }
    return isSafeResourcePath(filePath)
      ? { kind: 'workspace', href, filePath: `@workspace/${filePath}`, fileName: fileNameFromPath(filePath, 'file') }
      : { kind: 'invalid', href, target: 'workspace' };
  }
  if (!href.startsWith('/') && !/^[a-z][a-z\d+.-]*:/i.test(href) && !href.startsWith('//')) {
    let filePath: string;
    try {
      filePath = decodeURIComponent(href.startsWith('@chat/') ? href.slice(6) : href);
    } catch {
      return { kind: 'invalid', href, target: 'resource' };
    }
    return isSafeResourcePath(filePath)
      ? { kind: 'resource', href, filePath, fileName: fileNameFromPath(filePath, 'resource') }
      : { kind: 'invalid', href, target: 'resource' };
  }
  return parseWorkspacePathLink(href);
}

export function resolveConversationMarkdownLinkPreview(
  link: ConversationMarkdownInternalLink,
  agentKey: string,
  remoteChatId = ''
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
      resourceUrl: buildChatResourceUrl(link.filePath, remoteChatId),
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
    previewKind: resolveAuthenticatedResourcePreviewKind({ name: link.fileName }),
    sourcePath: link.filePath,
    line: link.line,
    ...(resourceUrl ? {} : { errorCode: 'missing_agent_scope' as const })
  };
}
