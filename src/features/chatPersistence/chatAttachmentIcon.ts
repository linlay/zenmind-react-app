import type { AppIconUsage } from '../../shared/icons/AppIcon.tsx';

const PDF_FILE_EXTENSION_RE = /\.pdf$/i;
const SHEET_FILE_EXTENSION_RE = /\.(csv|tsv|xls|xlsx)$/i;
const PRESENTATION_FILE_EXTENSION_RE = /\.(key|ppt|pptx)$/i;
const ARCHIVE_FILE_EXTENSION_RE = /\.(7z|gz|rar|tar|tgz|zip)$/i;
const DOCUMENT_FILE_EXTENSION_RE = /\.(doc|docx|rtf)$/i;
const TEXT_FILE_EXTENSION_RE = /\.(json|log|md|txt|xml|ya?ml)$/i;

export function resolveChatAttachmentFileIconUsage(input: {
  mimeType?: string | null;
  name?: string | null;
}): AppIconUsage {
  const mimeType = String(input.mimeType || '').toLowerCase();
  const fileName = String(input.name || '').toLowerCase();

  if (mimeType.includes('pdf') || PDF_FILE_EXTENSION_RE.test(fileName)) {
    return 'attachment.filePdf';
  }
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType.includes('csv') ||
    SHEET_FILE_EXTENSION_RE.test(fileName)
  ) {
    return 'attachment.fileSheet';
  }
  if (
    mimeType.includes('presentation') ||
    mimeType.includes('powerpoint') ||
    PRESENTATION_FILE_EXTENSION_RE.test(fileName)
  ) {
    return 'attachment.filePresentation';
  }
  if (
    mimeType.includes('zip') ||
    mimeType.includes('compressed') ||
    mimeType.includes('tar') ||
    ARCHIVE_FILE_EXTENSION_RE.test(fileName)
  ) {
    return 'attachment.fileArchive';
  }
  if (mimeType.includes('word') || mimeType.includes('document') || DOCUMENT_FILE_EXTENSION_RE.test(fileName)) {
    return 'attachment.fileDocument';
  }
  if (mimeType.startsWith('text/') || TEXT_FILE_EXTENSION_RE.test(fileName)) {
    return 'attachment.fileText';
  }
  return 'attachment.fileGeneric';
}
