const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, '.generated/conversation-preview');
const CHANNEL = 'zenmind-conversation-preview';

const CHILD_CSP = {
  mermaid:
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
  echarts:
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
  html: "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
};

function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function resolveDependencyFile(specifier, packageName) {
  try {
    return require.resolve(specifier, { paths: [PROJECT_ROOT] });
  } catch (error) {
    throw new Error(
      `Unable to generate conversation preview runtimes: ${packageName} is not installed. ` +
        'Run pnpm install manually after reviewing package.json.',
      { cause: error }
    );
  }
}

function readDependencySource(specifier, packageName) {
  return fs.readFileSync(resolveDependencyFile(specifier, packageName), 'utf8');
}

function createChildDocument(kind, vendorSource) {
  const commonStyle = `
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-width: 0; margin: 0; overflow: hidden; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body[data-theme="light"] { color: #182032; background: #ffffff; }
    body[data-theme="dark"] { color: #edf2ff; background: #111722; }
    #root { width: 100%; min-width: 0; }
  `;
  const sharedBridge = `
    (() => {
      'use strict';
      const CHANNEL = ${JSON.stringify(CHANNEL)};
      let capabilityToken = '';
      let activeRequestId = '';
      const report = (event) => {
        if (!capabilityToken || !activeRequestId) return;
        parent.postMessage({ channel: CHANNEL, token: capabilityToken, event: { ...event, requestId: activeRequestId } }, '*');
      };
      const reportError = (error) => {
        const message = error instanceof Error ? error.message : String(error || 'Preview failed.');
        report({ type: 'error', message: message.slice(0, 2000) });
      };
      const reportHeight = () => {
        const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1);
        report({ type: 'resize', height });
      };
      window.addEventListener('error', (event) => reportError(event.error || event.message));
      window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
      window.addEventListener('message', async (event) => {
        const payload = event.data;
        if (!payload || payload.channel !== CHANNEL || payload.type !== 'render' || typeof payload.token !== 'string') return;
        if (capabilityToken && capabilityToken !== payload.token) return;
        capabilityToken = payload.token;
        const request = payload.request;
        if (!request || typeof request.requestId !== 'string') return;
        activeRequestId = request.requestId;
        document.body.dataset.theme = request.theme === 'dark' ? 'dark' : 'light';
        try {
          await renderPreview(request);
          report({ type: 'ready' });
          requestAnimationFrame(reportHeight);
        } catch (error) {
          reportError(error);
        }
      });
    })();
  `;

  if (kind === 'mermaid') {
    const mermaidBootstrap = `
      const root = document.getElementById('root');
      const viewport = document.getElementById('viewport');
      let scale = 1;
      let translateX = 0;
      let translateY = 0;
      let dragging = false;
      let pointerX = 0;
      let pointerY = 0;
      const applyTransform = () => {
        viewport.style.transform = 'translate(' + translateX + 'px,' + translateY + 'px) scale(' + scale + ')';
      };
      const resetTransform = () => { scale = 1; translateX = 0; translateY = 0; applyTransform(); };
      const zoom = (factor) => { scale = Math.min(4, Math.max(0.35, scale * factor)); applyTransform(); };
      document.getElementById('zoom-in').addEventListener('click', () => zoom(1.2));
      document.getElementById('zoom-out').addEventListener('click', () => zoom(1 / 1.2));
      document.getElementById('reset').addEventListener('click', resetTransform);
      root.addEventListener('wheel', (event) => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
      root.addEventListener('pointerdown', (event) => {
        dragging = true; pointerX = event.clientX; pointerY = event.clientY; root.setPointerCapture(event.pointerId);
      });
      root.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        translateX += event.clientX - pointerX; translateY += event.clientY - pointerY;
        pointerX = event.clientX; pointerY = event.clientY; applyTransform();
      });
      const stopDragging = () => { dragging = false; };
      root.addEventListener('pointerup', stopDragging);
      root.addEventListener('pointercancel', stopDragging);
      async function renderPreview(request) {
        resetTransform();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          htmlLabels: false,
          theme: request.theme === 'dark' ? 'dark' : 'default',
          flowchart: { htmlLabels: false },
        });
        const renderId = 'diagram-' + request.requestId.replace(/[^a-zA-Z0-9_-]/g, '-');
        const result = await mermaid.render(renderId, String(request.source || ''));
        viewport.innerHTML = result.svg;
        const svg = viewport.querySelector('svg');
        if (svg) {
          svg.style.maxWidth = '100%';
          svg.style.height = 'auto';
          svg.querySelectorAll('a').forEach((link) => link.removeAttribute('href'));
        }
      }
    `;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CHILD_CSP.mermaid}"><style>${commonStyle}
      #root { position: relative; min-height: 160px; padding: 40px 12px 12px; overflow: hidden; touch-action: none; cursor: grab; }
      #root:active { cursor: grabbing; }
      #viewport { transform-origin: 50% 0; will-change: transform; }
      #toolbar { position: absolute; z-index: 2; top: 6px; right: 8px; display: flex; gap: 4px; }
      #toolbar button { min-width: 28px; height: 28px; border: 1px solid #cfd6e4; border-radius: 7px; background: rgba(255,255,255,.92); color: #33405a; font: 600 14px/1 sans-serif; }
      body[data-theme="dark"] #toolbar button { border-color: #3b465a; background: rgba(29,37,51,.94); color: #edf2ff; }
    </style></head><body><div id="root"><div id="toolbar"><button id="zoom-out" aria-label="Zoom out">−</button><button id="reset" aria-label="Reset">↺</button><button id="zoom-in" aria-label="Zoom in">+</button></div><div id="viewport"></div></div><script>${escapeInlineScript(vendorSource)}</script><script>${escapeInlineScript(mermaidBootstrap)}${escapeInlineScript(sharedBridge)}</script></body></html>`;
  }

  const echartsBootstrap = `
    const root = document.getElementById('root');
    let chart = null;
    const disposeChart = () => {
      if (chart && !chart.isDisposed()) chart.dispose();
      chart = null;
    };
    // Security exception: PC-compatible JavaScript option/functions are evaluated only in this
    // opaque-origin sandbox iframe. This Function call must never move into React Native/App JS.
    const parseOption = (source) => Function('"use strict"; return (' + source + '\\n);')();
    async function renderPreview(request) {
      disposeChart();
      root.style.height = request.mode === 'overlay' ? '100vh' : '320px';
      chart = echarts.init(root, request.theme === 'dark' ? 'dark' : undefined, { renderer: 'canvas' });
      const option = parseOption(String(request.source || ''));
      if (!option || typeof option !== 'object') throw new Error('ECharts source must evaluate to an option object.');
      chart.setOption(option, { notMerge: true, lazyUpdate: false });
    }
    const resizeObserver = new ResizeObserver(() => { if (chart && !chart.isDisposed()) chart.resize(); });
    resizeObserver.observe(root);
    window.addEventListener('resize', () => { if (chart && !chart.isDisposed()) chart.resize(); });
    window.addEventListener('pagehide', disposeChart);
    window.addEventListener('beforeunload', disposeChart);
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CHILD_CSP.echarts}"><style>${commonStyle}#root { height: 320px; min-height: 240px; }</style></head><body><div id="root"></div><script>${escapeInlineScript(vendorSource)}</script><script>${escapeInlineScript(echartsBootstrap)}${escapeInlineScript(sharedBridge)}</script></body></html>`;
}

function createOuterRuntime(kind, childDocument = '') {
  const outerScriptPolicy = kind === 'echarts' ? "'unsafe-inline' 'unsafe-eval'" : "'unsafe-inline'";
  const outerCsp = `default-src 'none'; script-src ${outerScriptPolicy}; style-src 'unsafe-inline'; frame-src data: blob:; child-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const script = `
    (() => {
      'use strict';
      const CHANNEL = ${JSON.stringify(CHANNEL)};
      const KIND = ${JSON.stringify(kind)};
      const CHILD_DOCUMENT = ${JSON.stringify(childDocument)};
      const frame = document.getElementById('preview-frame');
      let capabilityToken = '';
      let activeRequest = null;
      let htmlLoadGeneration = 0;
      const createToken = () => {
        if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
          throw new Error('Secure random capability tokens are unavailable.');
        }
        const bytes = new Uint8Array(24);
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
      };
      const emit = (event) => {
        const envelope = { channel: CHANNEL, event };
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(JSON.stringify(envelope));
          return;
        }
        window.parent.postMessage(envelope, '*');
      };
      const emitError = (requestId, error) => {
        const message = error instanceof Error ? error.message : String(error || 'Preview failed.');
        emit({ type: 'error', requestId, message: message.slice(0, 2000) });
      };
      const renderHtml = (request) => {
        const generation = ++htmlLoadGeneration;
        const csp = ${JSON.stringify(`<meta http-equiv="Content-Security-Policy" content="${CHILD_CSP.html}">`)};
        const guard = '<script>(()=>{const channel=' + JSON.stringify(CHANNEL) + ';const token=' + JSON.stringify(capabilityToken) + ';const requestId=' + JSON.stringify(request.requestId) + ';const emit=event=>parent.postMessage({channel,token,event:{...event,requestId}},"*");const reportHeight=()=>emit({type:"resize",height:Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0,1)});addEventListener("click",event=>{const target=event.target;target&&target.closest&&target.closest("a")&&event.preventDefault()},true);addEventListener("submit",event=>event.preventDefault(),true);addEventListener("error",event=>emit({type:"error",message:String(event.message||"Viewport failed.").slice(0,2000)}));addEventListener("unhandledrejection",event=>emit({type:"error",message:String(event.reason||"Viewport failed.").slice(0,2000)}));addEventListener("load",()=>requestAnimationFrame(reportHeight));if(typeof ResizeObserver!=="undefined")new ResizeObserver(reportHeight).observe(document.documentElement);window.open=()=>null;})();<\\/script>';
        frame.onload = () => {
          if (generation !== htmlLoadGeneration) return;
          if (Object.prototype.hasOwnProperty.call(request, 'initialData')) {
            frame.contentWindow.postMessage(request.initialData, '*');
          }
          emit({ type: 'ready', requestId: request.requestId });
        };
        const source = String(request.source || '');
        if (/<html(?:\\s|>)/i.test(source)) {
          frame.srcdoc = /<head(?:\\s|>)/i.test(source)
            ? source.replace(/<head(?:\\s[^>]*)?>/i, (head) => head + csp + guard)
            : source.replace(/<html(?:\\s[^>]*)?>/i, (html) => html + '<head>' + csp + guard + '</head>');
        } else {
          frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8">' + csp + guard + '</head><body>' + source + '</body></html>';
        }
      };
      const renderTrusted = (request) => {
        const send = () => frame.contentWindow.postMessage({ channel: CHANNEL, type: 'render', token: capabilityToken, request }, '*');
        if (frame.dataset.ready === 'true') send();
        else frame.onload = () => { frame.dataset.ready = 'true'; frame.onload = null; send(); };
        if (!frame.srcdoc) frame.srcdoc = CHILD_DOCUMENT;
      };
      const handleParentMessage = (event) => {
        if (event.source === frame.contentWindow) {
          const payload = event.data;
          if (!payload || payload.channel !== CHANNEL || payload.token !== capabilityToken || !activeRequest) return;
          const childEvent = payload.event;
          if (!childEvent || childEvent.requestId !== activeRequest.requestId) return;
          emit(childEvent);
          return;
        }
        let payload = event.data;
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch { return; }
        }
        const request = payload && payload.channel === CHANNEL ? payload.request : null;
        if (!request || request.kind !== KIND || typeof request.requestId !== 'string' || typeof request.source !== 'string') return;
        try {
          capabilityToken = createToken();
          activeRequest = request;
          if (KIND === 'html') renderHtml(request);
          else renderTrusted(request);
        } catch (error) {
          emitError(request.requestId, error);
        }
      };
      window.addEventListener('message', handleParentMessage);
      document.addEventListener('message', handleParentMessage);
    })();
  `;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${outerCsp}"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>*{box-sizing:border-box}html,body,#preview-frame{width:100%;height:100%;margin:0;border:0;overflow:hidden;background:transparent}</style></head><body><iframe id="preview-frame" title="${kind} preview" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><script>${escapeInlineScript(script)}</script></body></html>`;
}

function withGeneratedHash(content) {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `<!-- generated-sha256:${hash} -->\n${content}`;
}

function writeIfChanged(filePath, content) {
  const next = withGeneratedHash(content);
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === next) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
  return true;
}

function generateConversationPreviewRuntimes() {
  const mermaidSource = readDependencySource('mermaid/dist/mermaid.min.js', 'mermaid');
  const echartsSource = readDependencySource('echarts/dist/echarts.min.js', 'echarts');
  const runtimes = {
    mermaid: createOuterRuntime('mermaid', createChildDocument('mermaid', mermaidSource)),
    echarts: createOuterRuntime('echarts', createChildDocument('echarts', echartsSource)),
    html: createOuterRuntime('html')
  };
  const changed = Object.entries(runtimes).filter(([kind, content]) =>
    writeIfChanged(path.join(OUTPUT_DIRECTORY, `${kind}.runtime.html`), content)
  );
  process.stdout.write(
    changed.length > 0
      ? `Generated conversation preview runtimes: ${changed.map(([kind]) => kind).join(', ')}\n`
      : 'Conversation preview runtimes are up to date.\n'
  );
}

if (require.main === module) {
  generateConversationPreviewRuntimes();
}

module.exports = {
  CHILD_CSP,
  createChildDocument,
  createOuterRuntime,
  generateConversationPreviewRuntimes,
  withGeneratedHash,
  writeIfChanged
};
