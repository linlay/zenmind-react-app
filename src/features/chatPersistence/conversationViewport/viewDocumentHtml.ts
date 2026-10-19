import type { ChatViewDocument } from '../../../core/api/services/chatViewProtocol.ts';
import {
  CONVERSATION_PREVIEW_MAX_SOURCE_BYTES,
  getConversationPreviewSourceByteLength
} from '../../../shared/components/conversationPreview/runtimeBridge.ts';

const VIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function decodeAsset(data: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let bits = 0,
    buffer = 0,
    encoded = '';
  for (const char of data.replace(/=+$/, '')) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Invalid VIEW asset encoding');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      encoded += `%${((buffer >> bits) & 255).toString(16).padStart(2, '0')}`;
    }
  }
  return decodeURIComponent(encoded);
}

export function buildChatViewDocumentHtml(document: ChatViewDocument, usage: 'display' | 'form'): string {
  if (getConversationPreviewSourceByteLength(JSON.stringify(document)) > CONVERSATION_PREVIEW_MAX_SOURCE_BYTES)
    throw new Error('VIEW exceeds the 256 KiB safety limit');
  let html = document.html || '';
  if (document.view.renderer === 'qlc') {
    const definition = escapeHtml(JSON.stringify(document.qlc || {}, null, 2));
    html =
      usage === 'display'
        ? `<pre id="payload"></pre><details><summary>QLC</summary><pre>${definition}</pre></details><script>addEventListener('message',e=>{if(e.source!==parent)return;const m=e.data;if(m?.type==='view_init'||m?.type==='view_update')document.getElementById('payload').textContent=JSON.stringify(m.data?.payload,null,2)});</script>`
        : `<label>JSON<textarea id="form" style="width:100%;min-height:220px"></textarea></label><p id="error"></p><details><summary>QLC</summary><pre>${definition}</pre></details><script>let state;addEventListener('message',e=>{const m=e.data;if(m?.type==='awaiting_init'||m?.type==='awaiting_update'){state=m.data;document.getElementById('form').value=JSON.stringify(state.form||{},null,2)}if(m?.type==='awaiting_collect'&&state){try{const form=JSON.parse(document.getElementById('form').value);if(!form||typeof form!=='object'||Array.isArray(form))throw Error('JSON object required');parent.postMessage({type:'frontend_awaiting_submit',params:[{id:state.activeFormId,decision:'approve',form}]},'*')}catch(error){document.getElementById('error').textContent=String(error.message)}}});</script>`;
  } else if (document.view.renderer !== 'html') throw new Error('Unsupported VIEW renderer');
  if (!html.trim()) throw new Error('VIEW response has no content');
  const assets = new Map((document.assets || []).map((asset) => [asset.path, asset]));
  const entry = document.entry || 'views/index.html';
  const resolveAsset = (value: string, from: string) => {
    try {
      const url = new URL(value, `https://view.invalid/${from}`);
      return url.origin === 'https://view.invalid' ? assets.get(decodeURIComponent(url.pathname.slice(1))) : undefined;
    } catch {
      return undefined;
    }
  };
  const resolveUrl = (value: string, from: string) => {
    if (!value || value.startsWith('#') || value.startsWith('data:')) return value;
    const asset = resolveAsset(value, from);
    return asset && /^[\w.+-]+\/[\w.+-]+$/.test(asset.mediaType) && /^[A-Za-z0-9+/]*={0,2}$/.test(asset.data)
      ? `data:${asset.mediaType};base64,${asset.data}`
      : '';
  };
  const css = (value: string, from: string) =>
    value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_, _quote, url: string) => `url("${resolveUrl(url, from)}")`);
  // Embed only declared snapshot resources. CSP is the security boundary;
  // unsupported markup cannot fall back to a connector or network URL.
  html = html.replace(/<base\b[^>]*>/gi, '').replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '');
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
    const asset = href ? resolveAsset(href, entry) : undefined;
    return asset?.mediaType === 'text/css'
      ? `<style>${css(decodeAsset(asset.data), asset.path).replace(/<\/style/gi, '<\\/style')}</style>`
      : '';
  });
  html = html.replace(
    /<script\b([^>]*)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>[\s\S]*?<\/script>/gi,
    (_, before: string, _quote: string, src: string, after: string) => {
      const asset = resolveAsset(src, entry);
      return asset && ['text/javascript', 'application/javascript'].includes(asset.mediaType)
        ? `<script${before}${after}>${decodeAsset(asset.data).replace(/<\/script/gi, '<\\/script')}</script>`
        : '';
    }
  );
  html = html
    .replace(
      /\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi,
      (_, name: string, quote: string, value: string) => `${name}=${quote}${resolveUrl(value, entry)}${quote}`
    )
    .replace(/\bsrcset\s*=\s*(["']).*?\1/gi, '')
    .replace(
      /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
      (_, attrs: string, value: string) => `<style${attrs}>${css(value, entry)}</style>`
    )
    .replace(
      /\bstyle\s*=\s*(["'])(.*?)\1/gi,
      (_, quote: string, value: string) => `style=${quote}${escapeHtml(css(value, entry))}${quote}`
    );
  const policy = `<meta http-equiv="Content-Security-Policy" content="${VIEW_CSP}">`;
  return /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, (tag) => tag + policy)
    : `<!doctype html><head>${policy}</head>${html}`;
}
