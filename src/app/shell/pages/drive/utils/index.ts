import { buildDriveRawFilePath } from "../../../../../modules/drive/api/driveApi";
import { DriveEntry, DrivePreviewKind, DrivePreviewMeta, DriveSearchHit } from "../../../../../modules/drive/types";

export const buildTestID = (prefix: string | undefined, suffix: string) => {
  return prefix ? `${prefix}-${suffix}` : undefined;
};

export const sameEntry = (left: Pick<DriveEntry, 'mountId' | 'path'>, right: Pick<DriveEntry, 'mountId' | 'path'>) => {
  return left.mountId === right.mountId && left.path === right.path;
};

export const sortEntries = (rows: DriveEntry[]) => {
  return [...rows].sort((left, right) => {
    if (left.isDir && !right.isDir) return -1;
    if (!left.isDir && right.isDir) return 1;
    return left.name.localeCompare(right.name, 'zh-CN', {
      numeric: true,
      sensitivity: 'base'
    });
  });
};

export const sortSearchHits = (rows: DriveSearchHit[]) => {
  return [...rows].sort((left, right) => {
    if (left.isDir && !right.isDir) return -1;
    if (!left.isDir && right.isDir) return 1;
    return left.name.localeCompare(right.name, 'zh-CN', {
      numeric: true,
      sensitivity: 'base'
    });
  });
};

export const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '--';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

export const formatDateTime = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return new Date(value * 1000).toLocaleString();
};

export const formatRelativeDate = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '--';
  const diffMs = Date.now() - value * 1000;
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (diffMs < hourMs) {
    return `${Math.max(1, Math.round(diffMs / minuteMs))} 分钟前`;
  }
  if (diffMs < dayMs) {
    return `${Math.max(1, Math.round(diffMs / hourMs))} 小时前`;
  }
  return `${Math.max(1, Math.round(diffMs / dayMs))} 天前`;
};

export const basename = (path: string) => {
  return path.split('/').filter(Boolean).at(-1) || '';
};

export const dirnamePath = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return '/';
  }
  return `/${parts.slice(0, -1).join('/')}`;
};

export const normalizeDirectory = (path: string) => {
  const normalized = String(path || '').trim();
  if (!normalized) return '/';
  if (normalized === '/') return '/';
  const withoutTail = normalized.replace(/\/+$/, '');
  return withoutTail.startsWith('/') ? withoutTail : `/${withoutTail}`;
};

export const buildBreadcrumbs = (path: string) => {
  const normalized = normalizeDirectory(path);
  if (normalized === '/') {
    return [{ label: '根目录', path: '/' }];
  }
  const parts = normalized.split('/').filter(Boolean);
  const breadcrumbs = [{ label: '根目录', path: '/' }];
  let cursor = '';
  parts.forEach((part) => {
    cursor += `/${part}`;
    breadcrumbs.push({ label: part, path: cursor });
  });
  return breadcrumbs;
};

export const toEntryFromSearchHit = (hit: DriveSearchHit): DriveEntry => {
  return {
    mountId: hit.mountId,
    path: hit.path,
    name: hit.name,
    isDir: hit.isDir,
    size: hit.size,
    modTime: hit.modTime,
    mime: hit.mime,
    extension: extensionFromPath(hit.path)
  };
};

export const extensionFromPath = (path: string) => {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index).toLowerCase();
};

export const resolvePreviewRelativePath = (preview: DrivePreviewMeta) => {
  return preview.streamUrl || buildDriveRawFilePath(preview.mountId, preview.path);
};

export const getSingleMountId = (entries: DriveEntry[]) => {
  const mountIds = Array.from(new Set(entries.map((entry) => entry.mountId)));
  return mountIds.length === 1 ? mountIds[0] : '';
};

export const defaultTargetDirectory = (entries: DriveEntry[], currentMountId: string, currentPath: string) => {
  const first = entries[0];
  if (!first) {
    return currentPath || '/';
  }
  if (first.mountId === currentMountId) {
    return currentPath || '/';
  }
  return '/';
};

export const shouldLoadBlobPreview = (preview: DrivePreviewMeta) => {
  return preview.kind === 'image' || preview.kind === 'pdf' || preview.kind === 'video' || preview.kind === 'audio';
};

const INLINE_PREVIEW_KINDS: readonly DrivePreviewKind[] = ['image', 'video', 'audio', 'pdf', 'markdown', 'text'];

export const canInlinePreview = (preview: DrivePreviewMeta | null) => {
  return Boolean(preview && INLINE_PREVIEW_KINDS.includes(preview.kind));
};

export const describePreviewSupport = (preview: DrivePreviewMeta | null) => {
  if (!preview) {
    return '当前文件暂时没有可用的预览信息。';
  }

  switch (preview.kind) {
    case 'directory':
      return '目录类型不支持文件预览。';
    case 'download':
    case 'unknown':
      return '当前文件类型暂不支持预览。支持图片、文本、Markdown、PDF、音频和视频等常见格式。';
    default:
      return '当前文件暂不支持内嵌预览。';
  }
};

export const fileTone = (entry: DriveEntry, themeMode: 'light' | 'dark') => {
  if (entry.isDir) {
    return themeMode === 'dark'
      ? { color: '#80aaff', bg: 'rgba(120, 160, 255, 0.18)' }
      : { color: '#2f6cf3', bg: 'rgba(47, 108, 243, 0.13)' };
  }
  if (/zip|rar|tar|7z/i.test(entry.extension)) {
    return themeMode === 'dark'
      ? { color: '#ffb66c', bg: 'rgba(255, 171, 92, 0.18)' }
      : { color: '#f07a20', bg: 'rgba(240, 122, 32, 0.12)' };
  }
  return themeMode === 'dark'
    ? { color: '#9bc3ff', bg: 'rgba(120, 160, 255, 0.13)' }
    : { color: '#4d6fa9', bg: 'rgba(77, 111, 169, 0.12)' };
};

export const renderKindLabel = (preview: DrivePreviewMeta | null) => {
  if (!preview) return '文件';
  switch (preview.kind) {
    case 'directory':
      return '目录';
    case 'image':
      return '图片';
    case 'video':
      return '视频';
    case 'audio':
      return '音频';
    case 'pdf':
      return 'PDF';
    case 'markdown':
      return 'Markdown';
    case 'text':
      return '文本';
    case 'download':
      return '文件';
    default:
      return '未知类型';
  }
}
