import { normalizeAuthenticatedResourceFileName } from './authenticatedResourceModel.ts';

export const CHAT_EXPORT_MAX_BYTES = 20 * 1024 * 1024;
export const CHAT_EXPORT_TEMPLATE_MAX_BYTES = 256 * 1024;
export type ChatExportFormat = 'markdown' | 'html';
export type ChatExportFile = { bytes: Uint8Array<ArrayBuffer>; fileName: string; mimeType: string };
export class ChatExportError extends Error {
  constructor(readonly code: 'unavailable' | 'too_large' | 'invalid' | 'failed' | 'cancelled') {
    super(`chat_export_${code}`);
    this.name = 'ChatExportError';
  }
}

export function resolveChatExportAssetOrigin(value: string): string {
  if (!value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
      throw new Error();
    return url.origin;
  } catch {
    throw new ChatExportError('invalid');
  }
}

export function chatExportFileName(header: string | null, chatId: string, format: ChatExportFormat): string {
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header ?? '');
  const plain = /filename="([^"]+)"|filename=([^;]+)/i.exec(header ?? '');
  let name = plain?.[1] ?? plain?.[2] ?? chatId;
  if (utf8) {
    try {
      name = decodeURIComponent(utf8[1]);
    } catch {
      name = chatId;
    }
  }
  name = normalizeAuthenticatedResourceFileName(name).replace(/\.(?:snapshot\.json|md|html)$/i, '');
  return `${name.slice(0, 120) || 'conversation'}.${format === 'html' ? 'html' : 'md'}`;
}

/** Only the frozen V1 contract can be embedded; no live protocol envelopes or resource tickets. */
export function buildChatExportHtml(
  snapshotBytes: Uint8Array,
  template: string,
  origin: string,
  brandId: string
): Uint8Array<ArrayBuffer> {
  if (
    snapshotBytes.byteLength > CHAT_EXPORT_MAX_BYTES ||
    new TextEncoder().encode(template).byteLength > CHAT_EXPORT_TEMPLATE_MAX_BYTES
  )
    throw new ChatExportError('too_large');
  if (!resolveChatExportAssetOrigin(origin) || !/^[a-z][a-z0-9-]*$/.test(brandId)) throw new ChatExportError('invalid');
  let snapshot: Record<string, unknown>;
  try {
    snapshot = JSON.parse(new TextDecoder().decode(snapshotBytes));
  } catch {
    throw new ChatExportError('invalid');
  }
  if (
    !snapshot ||
    snapshot.version !== 1 ||
    typeof snapshot.title !== 'string' ||
    !snapshot.title.trim() ||
    snapshot.title.length > 300 ||
    !['zh-CN', 'en-US'].includes(String(snapshot.locale)) ||
    !Number.isSafeInteger(snapshot.createdAt) ||
    Number(snapshot.createdAt) < 1_000_000_000_000 ||
    !Number.isSafeInteger(snapshot.capturedAt) ||
    Number(snapshot.capturedAt) < Number(snapshot.createdAt) ||
    !Array.isArray(snapshot.turns) ||
    !snapshot.turns.length ||
    !Array.isArray(snapshot.attachments)
  )
    throw new ChatExportError('invalid');
  if (snapshot.turns.length > 2000) throw new ChatExportError('too_large');
  const ids = new Set<string>();
  for (const turn of snapshot.turns) {
    if (
      !turn ||
      typeof turn.runId !== 'string' ||
      !turn.runId ||
      !Array.isArray(turn.nodes) ||
      !Number.isSafeInteger(turn.queryAt) ||
      turn.queryAt < 1_000_000_000_000 ||
      !Number.isSafeInteger(turn.startedAt) ||
      turn.startedAt < 1_000_000_000_000 ||
      !['running', 'completed', 'failed', 'cancelled'].includes(turn.outcome)
    )
      throw new ChatExportError('invalid');
    if (!turn.nodes.length || turn.nodes.length > 2000) throw new ChatExportError('too_large');
    for (const node of turn.nodes) {
      if (
        !node ||
        typeof node.id !== 'string' ||
        !node.id ||
        ids.has(node.id) ||
        node.runId !== turn.runId ||
        !['message', 'thinking', 'awaiting-answer', 'tool', 'source', 'content', 'agent-group', 'planning'].includes(
          node.kind
        ) ||
        !Number.isSafeInteger(node.at) ||
        node.at < 1_000_000_000_000
      )
        throw new ChatExportError('invalid');
      ids.add(node.id);
    }
  }
  for (const attachment of snapshot.attachments) {
    if (
      !attachment ||
      typeof attachment.sourceRef !== 'string' ||
      !/^artifacts\/[^/?#]+\/[^/?#]+$/.test(attachment.sourceRef) ||
      typeof attachment.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(attachment.sha256) ||
      !Number.isSafeInteger(attachment.size) ||
      attachment.size < 0
    )
      throw new ChatExportError('invalid');
    let path: string;
    try {
      path = decodeURIComponent(attachment.sourceRef);
    } catch {
      throw new ChatExportError('invalid');
    }
    if (
      path.includes('\\') ||
      path.includes('\0') ||
      path.split('/').length !== 3 ||
      path.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new ChatExportError('invalid');
  }
  // Content text can legitimately discuss credentials; reject credential fields, not words in a message.
  const stack: unknown[] = [snapshot];
  while (stack.length) {
    const value = stack.pop();
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (/^(?:authorization|access_?token|refresh_?token|resourceTicket|ticket)$/i.test(key))
          throw new ChatExportError('invalid');
        if (child && typeof child === 'object') stack.push(child);
      }
    }
  }
  const snapshotMarker = '__CONVERSATION_EXPORT_SNAPSHOT_JSON_V1__',
    originMarker = '__CONVERSATION_EXPORT_ASSET_ORIGIN__',
    brandMarker = '__CONVERSATION_EXPORT_LOCAL_BRAND_ID__';
  if (
    !/<meta\s+name="conversation-export-profile"\s+content="conversation-snapshot-json-v2"\s*\/>/i.test(template) ||
    !/<meta\s+name="conversation-export-asset-set"\s+content="[a-f0-9]{64}"\s*\/>/i.test(template) ||
    !/http-equiv="Content-Security-Policy"/i.test(template) ||
    template.split(snapshotMarker).length !== 2 ||
    template.split(brandMarker).length !== 2 ||
    !template.includes(originMarker) ||
    !new RegExp(
      `<script\\s+id="conversation-snapshot"\\s+type="application/json">\\s*${snapshotMarker}\\s*</script>`,
      'i'
    ).test(template)
  )
    throw new ChatExportError('invalid');
  const escaped = JSON.stringify(snapshot).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
  // Function replacements keep literal '$&' etc. in user text intact.
  const shell = template.replaceAll(originMarker, origin).replace(brandMarker, () => brandId);
  if (/__CONVERSATION_EXPORT_[A-Z0-9_]+__/.test(shell.replace(snapshotMarker, '')))
    throw new ChatExportError('invalid');
  const html = shell.replace(snapshotMarker, () => escaped);
  const bytes = new TextEncoder().encode(html);
  if (bytes.byteLength > CHAT_EXPORT_MAX_BYTES) throw new ChatExportError('too_large');
  return bytes;
}
