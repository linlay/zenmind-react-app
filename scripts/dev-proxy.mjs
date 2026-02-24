#!/usr/bin/env node

import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

const TARGET_ORIGIN = String(process.env.ZENMIND_PROXY_TARGET || 'https://app.zenmind.cc').trim().replace(/\/+$/, '');
const PROXY_PORT = Number(process.env.ZENMIND_PROXY_PORT || 19080);
const PROXY_HOST = String(process.env.ZENMIND_PROXY_HOST || '127.0.0.1').trim() || '127.0.0.1';
const DEBUG = String(process.env.ZENMIND_PROXY_DEBUG || '1') !== '0';
const ALLOW_PREFIXES = ['/api/', '/appterm'];
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

let targetBaseUrl;
try {
  targetBaseUrl = new URL(TARGET_ORIGIN);
} catch (error) {
  console.error(`[dev-proxy] Invalid ZENMIND_PROXY_TARGET: ${TARGET_ORIGIN}`);
  console.error(error);
  process.exit(1);
}

function isAllowedPath(pathname) {
  if (!pathname) return false;
  return ALLOW_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

function setCorsHeaders(req, res) {
  const origin = String(req.headers.origin || '*');
  const requestedHeaders = String(req.headers['access-control-request-headers'] || 'authorization,content-type');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', requestedHeaders);
}

function buildTargetUrl(reqUrl) {
  const url = new URL(String(reqUrl || '/'), targetBaseUrl);
  if (!isAllowedPath(url.pathname)) {
    return null;
  }
  return url;
}

function sanitizeRequestHeaders(rawHeaders, targetHost) {
  const headers = {};
  for (const [key, value] of Object.entries(rawHeaders || {})) {
    if (!value) continue;
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) continue;
    if (normalizedKey === 'host') continue;
    if (normalizedKey.startsWith('sec-fetch-')) continue;
    if (normalizedKey.startsWith('sec-ch-')) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  headers.host = targetHost;
  // Avoid upstream compression so browser decoding stays consistent.
  headers['accept-encoding'] = 'identity';
  if (headers.origin) {
    headers.origin = targetBaseUrl.origin;
  }
  if (headers.referer) {
    headers.referer = `${targetBaseUrl.origin}/`;
  }
  return headers;
}

function sanitizeUpgradeHeaders(rawHeaders, targetHost) {
  const headers = {};
  for (const [key, value] of Object.entries(rawHeaders || {})) {
    if (!value) continue;
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'host') continue;
    if (normalizedKey === 'proxy-authenticate' || normalizedKey === 'proxy-authorization') continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  headers.host = targetHost;
  if (headers.origin) {
    headers.origin = targetBaseUrl.origin;
  }
  if (headers.referer) {
    headers.referer = `${targetBaseUrl.origin}/`;
  }
  return headers;
}

function copyUpstreamHeaders(upstreamHeaders, res) {
  for (const [key, value] of upstreamHeaders.entries()) {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) continue;
    if (normalizedKey === 'content-encoding') continue;
    if (normalizedKey === 'content-length') continue;
    if (normalizedKey === 'access-control-allow-origin') continue;
    if (normalizedKey === 'access-control-allow-credentials') continue;
    if (normalizedKey === 'access-control-allow-headers') continue;
    if (normalizedKey === 'access-control-allow-methods') continue;
    res.setHeader(key, value);
  }
}

async function handleHttpRequest(req, res) {
  const startedAt = Date.now();
  setCorsHeaders(req, res);

  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const targetUrl = buildTargetUrl(req.url);
  if (!targetUrl) {
    if (DEBUG) {
      console.log(`[dev-proxy] ${method} ${req.url || '/'} -> blocked (not proxied)`);
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Path is not proxied' }));
    return;
  }

  const init = {
    method,
    headers: sanitizeRequestHeaders(req.headers, targetUrl.host),
    redirect: 'manual'
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(req);
    init.duplex = 'half';
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(targetUrl, init);
  } catch (error) {
    if (DEBUG) {
      console.log(
        `[dev-proxy] ${method} ${req.url || '/'} -> ${targetUrl.toString()} FAILED ${Date.now() - startedAt}ms`
      );
    }
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Failed to connect upstream', detail: String(error) }));
    return;
  }

  res.statusCode = upstreamResponse.status;
  copyUpstreamHeaders(upstreamResponse.headers, res);

  if (method === 'HEAD' || !upstreamResponse.body) {
    if (DEBUG) {
      console.log(
        `[dev-proxy] ${method} ${req.url || '/'} -> ${targetUrl.toString()} ${upstreamResponse.status} ${Date.now() - startedAt}ms`
      );
    }
    res.end();
    return;
  }

  if (DEBUG) {
    console.log(
      `[dev-proxy] ${method} ${req.url || '/'} -> ${targetUrl.toString()} ${upstreamResponse.status} ${Date.now() - startedAt}ms`
    );
  }
  Readable.fromWeb(upstreamResponse.body).pipe(res);
}

function handleUpgrade(req, clientSocket, head) {
  const targetUrl = buildTargetUrl(req.url);
  if (!targetUrl) {
    if (DEBUG) {
      console.log(`[dev-proxy] WS ${req.url || '/'} -> blocked (not proxied)`);
    }
    clientSocket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    clientSocket.destroy();
    return;
  }

  const client = targetUrl.protocol === 'https:' ? https : http;
  const proxyReq = client.request({
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    method: 'GET',
    path: `${targetUrl.pathname}${targetUrl.search}`,
    headers: sanitizeUpgradeHeaders(req.headers, targetUrl.host)
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    if (DEBUG) {
      console.log(`[dev-proxy] WS ${req.url || '/'} -> ${targetUrl.toString()} ${proxyRes.statusCode || 101}`);
    }
    const statusCode = proxyRes.statusCode || 101;
    const statusMessage = proxyRes.statusMessage || 'Switching Protocols';
    const responseHeaders = [`HTTP/1.1 ${statusCode} ${statusMessage}`];

    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (!value) continue;
      responseHeaders.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }

    clientSocket.write(`${responseHeaders.join('\r\n')}\r\n\r\n`);
    if (proxyHead?.length) {
      clientSocket.write(proxyHead);
    }
    if (head?.length) {
      proxySocket.write(head);
    }

    proxySocket.pipe(clientSocket);
    clientSocket.pipe(proxySocket);

    proxySocket.on('error', () => {
      clientSocket.destroy();
    });
    clientSocket.on('error', () => {
      proxySocket.destroy();
    });
  });

  proxyReq.on('response', (proxyRes) => {
    if (DEBUG) {
      console.log(`[dev-proxy] WS ${req.url || '/'} -> ${targetUrl.toString()} ${proxyRes.statusCode || 502}`);
    }
    const statusCode = proxyRes.statusCode || 502;
    const statusMessage = proxyRes.statusMessage || 'Bad Gateway';
    clientSocket.write(`HTTP/1.1 ${statusCode} ${statusMessage}\r\nConnection: close\r\n\r\n`);
    clientSocket.destroy();
  });

  proxyReq.on('error', () => {
    if (DEBUG) {
      console.log(`[dev-proxy] WS ${req.url || '/'} -> ${targetUrl.toString()} FAILED`);
    }
    clientSocket.destroy();
  });

  proxyReq.end();
}

const server = http.createServer((req, res) => {
  handleHttpRequest(req, res).catch((error) => {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Proxy server error', detail: String(error) }));
  });
});

server.on('upgrade', handleUpgrade);

server.listen(PROXY_PORT, PROXY_HOST, () => {
  console.log(`[dev-proxy] listening on http://${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`[dev-proxy] forwarding to ${targetBaseUrl.origin}`);
  console.log(`[dev-proxy] path prefixes: ${ALLOW_PREFIXES.join(', ')}`);
  console.log(`[dev-proxy] debug=${DEBUG ? 'on' : 'off'}`);
});
