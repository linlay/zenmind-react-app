import { readAwaitingSubmitParam } from '../../../../core/api/services/chatApi.ts';
import {
  CONVERSATION_PREVIEW_MAX_BRIDGE_PARAMS_BYTES,
  exceedsConversationPreviewByteLimit
} from '../../../../shared/components/conversationPreview/runtimeBridge.ts';

export function readAwaitingFormFrameReply(raw: unknown, frameId: string) {
  try {
    const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!message || message.frameId !== frameId) return null;
    if (message.type === 'ready' || message.type === 'frontend_awaiting_invalid') return { type: message.type };
    if (message.type === 'awaiting_resize' && Number.isFinite(message.height))
      return { type: 'awaiting_resize', height: Math.min(380, Math.max(180, Math.ceil(message.height))) };
    if (
      message.type !== 'frontend_awaiting_submit' ||
      exceedsConversationPreviewByteLimit(JSON.stringify(message.param), CONVERSATION_PREVIEW_MAX_BRIDGE_PARAMS_BYTES)
    )
      return null;
    const param = readAwaitingSubmitParam(message.param, 'form');
    return param ? { type: 'frontend_awaiting_submit', param } : null;
  } catch {
    return null;
  }
}

// A dedicated Form host: the inner document never owns the Native bridge, and
// only these Form messages can cross the exact child-frame boundary.
export function buildAwaitingFormFrameHtml(html: string, frameId: string): string {
  const literal = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c');
  const guard = `<script>try{delete window.ReactNativeWebView;Object.defineProperty(window,'ReactNativeWebView',{value:undefined,writable:false,configurable:false})}catch{}window.open=()=>null;addEventListener('click',event=>{if(event.target?.closest?.('a'))event.preventDefault()},true);</script>`;
  html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (head) => head + guard) : guard + html;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src data: blob:; child-src data: blob:; form-action 'none'; base-uri 'none'"><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;background:transparent}</style></head><body><iframe id="form" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><script>
  (()=>{const frameId=${literal(frameId)},frame=document.getElementById('form');let ready=false;
  const send=value=>{const message={...value,frameId};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(message));else parent.postMessage(message,'*')};
  const receive=event=>{let value=event.data;try{if(typeof value==='string')value=JSON.parse(value)}catch{return}if(!value||typeof value!=='object')return;
  if(event.source===frame.contentWindow){if(value.type==='frontend_awaiting_submit'||value.type==='frontend_awaiting_invalid'||value.type==='awaiting_resize')send(value);return}
  if(value.frameId!==frameId||!ready||!['awaiting_init','awaiting_update','awaiting_collect'].includes(value.type))return;
  frame.contentWindow.postMessage({type:value.type,data:value.data},'*')};
  addEventListener('message',receive);document.addEventListener('message',receive);
  frame.onload=()=>{ready=true;send({type:'ready'})};frame.srcdoc=${literal(html)};
  })();</script></body></html>`;
}
