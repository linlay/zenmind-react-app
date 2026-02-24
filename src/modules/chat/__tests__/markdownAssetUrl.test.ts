import {
  buildApDataUrl,
  isDirectImageUrl,
  isAbsoluteHttpUrl,
  resolveMarkdownImageUrl,
  resolveMarkdownLinkUrl,
  sanitizeFilePath
} from '../utils/markdownAssetUrl';

describe('markdownAssetUrl', () => {
  const backendUrl = 'https://api.example.com';
  const chatImageToken = 'token-abc';

  it('detects absolute http/https urls only', () => {
    expect(isAbsoluteHttpUrl('http://example.com/a.png')).toBe(true);
    expect(isAbsoluteHttpUrl('https://example.com/a.png')).toBe(true);
    expect(isAbsoluteHttpUrl('/data/a.png')).toBe(false);
    expect(isAbsoluteHttpUrl('data:image/png;base64,abc')).toBe(false);
  });

  it('detects direct image urls that do not require chatImageToken', () => {
    expect(isDirectImageUrl('https://example.com/a.png')).toBe(true);
    expect(isDirectImageUrl('//cdn.example.com/a.png')).toBe(true);
    expect(isDirectImageUrl('data:image/png;base64,abc')).toBe(true);
    expect(isDirectImageUrl('blob:https://example.com/abc')).toBe(true);
    expect(isDirectImageUrl('/data/a.png')).toBe(false);
  });

  it('sanitizes file path by removing query and hash', () => {
    expect(sanitizeFilePath(' /data/报告 2026#.pdf?x=1#preview ')).toBe('/data/报告 2026');
    expect(sanitizeFilePath('sample_photo.jpg?size=small')).toBe('sample_photo.jpg');
    expect(sanitizeFilePath('')).toBe('');
  });

  it('builds /api/ap/data url with encoded file, optional download and optional token', () => {
    expect(buildApDataUrl(backendUrl, '/data/sample_photo.jpg', false))
      .toBe('https://api.example.com/api/ap/data?file=%2Fdata%2Fsample_photo.jpg');
    expect(buildApDataUrl(backendUrl, 'report 2026-02.pdf', true))
      .toBe('https://api.example.com/api/ap/data?file=report%202026-02.pdf&download=true');
    expect(buildApDataUrl(backendUrl, '/data/sample_photo.jpg', false, chatImageToken))
      .toBe('https://api.example.com/api/ap/data?file=%2Fdata%2Fsample_photo.jpg&t=token-abc');
  });

  it('resolves markdown image url with signed token for non-http paths', () => {
    expect(resolveMarkdownImageUrl('https://cdn.example.com/a.png', backendUrl, chatImageToken))
      .toBe('https://cdn.example.com/a.png');
    expect(resolveMarkdownImageUrl('//cdn.example.com/a.png', backendUrl, chatImageToken))
      .toBe('https://cdn.example.com/a.png');
    expect(resolveMarkdownImageUrl('data:image/png;base64,abc', backendUrl, chatImageToken))
      .toBe('data:image/png;base64,abc');
    expect(resolveMarkdownImageUrl('/data/sample_photo.jpg', backendUrl, chatImageToken))
      .toBe('https://api.example.com/api/ap/data?file=%2Fdata%2Fsample_photo.jpg&t=token-abc');
    expect(resolveMarkdownImageUrl('sample photo.jpg', backendUrl, chatImageToken))
      .toBe('https://api.example.com/api/ap/data?file=sample%20photo.jpg&t=token-abc');
    expect(resolveMarkdownImageUrl('/api/ap/data?file=%2Fdata%2Fnested.png', backendUrl, chatImageToken))
      .toBe('https://api.example.com/api/ap/data?file=%2Fdata%2Fnested.png&t=token-abc');
  });

  it('returns empty for non-http image paths when token is missing', () => {
    expect(resolveMarkdownImageUrl('/data/sample_photo.jpg', backendUrl, '')).toBe('');
    expect(resolveMarkdownImageUrl('/api/ap/data?file=%2Fdata%2Fnested.png', backendUrl, '')).toBe('');
  });

  it('resolves markdown link url for attachments with download=true', () => {
    expect(resolveMarkdownLinkUrl('/data/a.pdf', backendUrl, true))
      .toBe('https://api.example.com/api/ap/data?file=%2Fdata%2Fa.pdf&download=true');
    expect(resolveMarkdownLinkUrl('report 2026-02.pdf', backendUrl, true))
      .toBe('https://api.example.com/api/ap/data?file=report%202026-02.pdf&download=true');
  });

  it('resolves non-http links through /api/ap/data even when not attachment', () => {
    expect(resolveMarkdownLinkUrl('/chat/123', backendUrl, false))
      .toBe('https://api.example.com/api/ap/data?file=%2Fchat%2F123');
    expect(resolveMarkdownLinkUrl('docs/readme', backendUrl, false))
      .toBe('https://api.example.com/api/ap/data?file=docs%2Freadme');
  });

  it('adds download=true when /api/ap/data link is already provided', () => {
    const resolved = resolveMarkdownLinkUrl('/api/ap/data?file=%2Fdata%2Fa.pdf', backendUrl, true);
    expect(resolved).toContain('https://api.example.com/api/ap/data?');
    const parsed = new URL(resolved);
    expect(parsed.searchParams.get('file')).toBe('/data/a.pdf');
    expect(parsed.searchParams.get('download')).toBe('true');
  });

  it('returns safe fallback for empty input', () => {
    expect(resolveMarkdownImageUrl('', backendUrl, chatImageToken)).toBe('');
    expect(resolveMarkdownLinkUrl('', backendUrl, true)).toBe('');
  });

  it('keeps custom scheme links unchanged', () => {
    expect(resolveMarkdownLinkUrl('mailto:test@example.com', backendUrl, false))
      .toBe('mailto:test@example.com');
  });
});
