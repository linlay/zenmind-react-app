// @ts-nocheck
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Linking, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { authorizedFetch } from '../../../core/auth/appAuth';
import { FONT_MONO, FONT_SANS } from '../../../core/constants/theme';
import { toSmartTime } from '../../../shared/utils/format';
import { TimelineEntry } from '../types/chat';
import { getActionGlyph, getTaskTone, normalizeTaskStatus } from '../services/eventNormalizer';
import { isDirectImageUrl, isAbsoluteHttpUrl, resolveMarkdownImageUrl, resolveMarkdownLinkUrl } from '../utils/markdownAssetUrl';
import { partitionStreamingBlocks, splitStreamingMarkdownBlocks } from '../utils/markdownStreamingBlocks';
import type { StreamingMarkdownBlock } from '../utils/markdownStreamingBlocks';
import { ViewportBlockView } from './ViewportBlockView';

interface TimelineEntryRowProps {
  item: TimelineEntry;
  theme: {
    timelineLine: string;
    timelineDot: string;
    ok: string;
    danger: string;
    warn: string;
    text: string;
    textSoft: string;
    textMute: string;
    primary: string;
    primaryDeep: string;
    primarySoft: string;
    surfaceSoft: string;
    surfaceStrong: string;
    userBubble: [string, string];
    systemBubble: string;
  };
  contentWidth: number;
  backendUrl: string;
  chatImageToken: string;
  toolExpanded: boolean;
  onToggleTool: (id: string) => void;
  onToggleReasoning: (id: string) => void;
  onCopyText: (text: string) => void;
  onImageAuthError: () => void;
}

const AUTH_RETRY_QUICK_DELAYS_MS = [200, 450, 900];
const AUTH_RETRY_PERIODIC_INTERVAL_MS = 3000;
const AUTH_RETRY_TOTAL_WINDOW_MS = 30_000;
const AUTH_FAILURE_REGEX = /(^|[^0-9])(401|403)([^0-9]|$)|forbidden|unauthori[sz]ed|expired|signature|token/i;

function parseViewportHeaderFields(headerLine: string) {
  const result: Record<string, string> = {};
  const parts = String(headerLine || '').split(',');
  for (const part of parts) {
    const [rawKey, ...rawValueParts] = part.split('=');
    if (!rawKey || rawValueParts.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join('=').trim();
    if (!key || !value) continue;
    result[key] = value;
  }
  return result;
}

function splitViewportBlocks(rawText: string) {
  const text = String(rawText || '');
  if (!text) return [] as Array<Record<string, unknown>>;

  const regex = /```viewport\s*\n?([\s\S]*?)```/gi;
  const segments: Array<Record<string, unknown>> = [];
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      segments.push({ type: 'markdown', content: text.slice(lastIndex, match.index) });
    }

    const blockContent = (match[1] || '').trim();
    const lines = blockContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length >= 2) {
      const fields = parseViewportHeaderFields(lines[0]);
      const viewportType = (fields.type || '').toLowerCase();
      const viewportKey = fields.key || '';
      if (viewportType && viewportKey) {
        const payloadRaw = lines.slice(1).join('\n');
        let payload: Record<string, unknown> | null = null;
        try {
          payload = JSON.parse(payloadRaw) as Record<string, unknown>;
        } catch {
          payload = null;
        }
        segments.push({
          type: 'viewport',
          viewportType,
          viewportKey,
          payload,
          payloadRaw
        });
      } else {
        segments.push({ type: 'viewport', content: blockContent });
      }
    } else {
      segments.push({ type: 'viewport', content: blockContent });
    }

    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'markdown', content: text.slice(lastIndex) });
  }

  if (!segments.length) {
    segments.push({ type: 'markdown', content: text });
  }

  return segments;
}

function extractTextFromMarkdownChildren(children: unknown): string {
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map((child) => extractTextFromMarkdownChildren(child)).join('');
  }
  if (typeof children === 'object' && children && 'props' in (children as Record<string, unknown>)) {
    const props = (children as { props?: { children?: unknown } }).props;
    return extractTextFromMarkdownChildren(props?.children);
  }
  return '';
}

function pathFromHref(rawHref: string): string {
  const text = String(rawHref || '').trim();
  if (!text) return '';
  try {
    return new URL(text, 'https://zenmind.local').pathname || '';
  } catch {
    return text.split('#')[0]?.split('?')[0] || '';
  }
}

function safeDecodeURIComponent(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function fileNameFromHref(rawHref: string): string {
  const text = String(rawHref || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text, 'https://zenmind.local');
    const pathname = parsed.pathname || '';
    if (pathname === '/api/ap/data' || pathname.startsWith('/api/ap/data/')) {
      const fileParam = safeDecodeURIComponent(parsed.searchParams.get('file') || '');
      const fileSegments = fileParam.split('/').filter(Boolean);
      const fromFileParam = fileSegments[fileSegments.length - 1] || '';
      if (fromFileParam) return fromFileParam;
    }
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    return safeDecodeURIComponent(last);
  } catch {
    const pathname = pathFromHref(rawHref);
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    return safeDecodeURIComponent(last);
  }
}

function fileExtensionFromName(rawName: string): string {
  const match = String(rawName || '').trim().match(/\.([a-z0-9]{1,10})$/i);
  return match ? String(match[1] || '').toLowerCase() : '';
}

function looksLikeAttachmentHref(rawHref: string, labelText: string): boolean {
  const raw = String(rawHref || '').toLowerCase();
  const label = String(labelText || '').toLowerCase();
  const path = pathFromHref(rawHref).toLowerCase();

  if (!raw) return false;
  if (/(^|[?&])(download|attachment)=1($|&)/.test(raw) || /(^|[?&])download=true($|&)/.test(raw)) {
    return true;
  }
  if (path.startsWith('/api/ap/data') || path.startsWith('/data/') || path.includes('/data/')) {
    return true;
  }
  if (label.includes('附件') || label.includes('download')) {
    return true;
  }

  if (/\.(png|jpe?g|gif|webp|bmp|svg|ico|heic|avif)$/i.test(path)) {
    return false;
  }

  return /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|tgz|csv|txt|md|json|xml|sql|apk|ipa|dmg|exe|msi)$/i.test(path);
}

function resolveAttachmentTitle(rawHref: string, resolvedHref: string, labelText: string): string {
  const normalizedLabel = String(labelText || '').trim().replace(/^下载附件[:：]\s*/i, '');
  if (normalizedLabel && normalizedLabel !== rawHref && normalizedLabel !== resolvedHref) {
    return normalizedLabel;
  }

  const fromResolved = fileNameFromHref(resolvedHref);
  if (fromResolved) return fromResolved;

  const fromRaw = fileNameFromHref(rawHref);
  if (fromRaw) return fromRaw;

  return normalizedLabel || '附件';
}

function normalizeBackendBase(backendUrl: string): string {
  return String(backendUrl || '').trim().replace(/\/+$/, '');
}

function toAuthedRequestPath(assetUrl: string, backendUrl: string): string {
  const normalizedBase = normalizeBackendBase(backendUrl);
  const base = normalizedBase ? `${normalizedBase}/` : 'https://zenmind.local/';
  try {
    const parsed = new URL(String(assetUrl || '').trim(), base);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    const text = String(assetUrl || '').trim();
    return text.startsWith('/') ? text : `/${text}`;
  }
}

function safeDecodeUrlPart(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function fileNameFromContentDisposition(raw: string): string {
  const text = String(raw || '');
  const utf8Match = text.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return safeDecodeUrlPart(String(utf8Match[1]).trim().replace(/^["']|["']$/g, ''));
  }
  const basicMatch = text.match(/filename\s*=\s*("?)([^";]+)\1/i);
  if (basicMatch?.[2]) {
    return String(basicMatch[2]).trim();
  }
  return '';
}

function toSafeDownloadName(raw: string, fallback = '附件'): string {
  const text = String(raw || '').trim();
  if (!text) return fallback;
  const normalized = text.replace(/[\\/:*?"<>|]/g, '_').trim();
  return normalized || fallback;
}

async function fetchAuthedAssetBlob(backendUrl: string, assetUrl: string): Promise<{ blob: Blob; fileName: string }> {
  const requestPath = toAuthedRequestPath(assetUrl, backendUrl);
  const response = await authorizedFetch(backendUrl, requestPath, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`下载失败（${response.status}）`);
  }
  const contentDisposition = response.headers?.get?.('content-disposition') || '';
  const headerName = fileNameFromContentDisposition(contentDisposition);
  const fallbackName = fileNameFromHref(assetUrl) || '附件';
  const blob = await response.blob();
  return {
    blob,
    fileName: toSafeDownloadName(headerName || fallbackName, '附件')
  };
}

async function createBlobPreviewUrl(blob: Blob): Promise<{ url: string; revoke: () => void }> {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const objectUrl = URL.createObjectURL(blob);
    return {
      url: objectUrl,
      revoke: () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore revoke failures
        }
      }
    };
  }

  if (typeof FileReader !== 'undefined') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('无法读取文件'));
      reader.readAsDataURL(blob);
    });
    return { url: dataUrl, revoke: () => {} };
  }

  throw new Error('当前环境不支持文件预览');
}

async function triggerDownloadFromUrl(downloadUrl: string, downloadName: string): Promise<void> {
  const doc = (globalThis as any)?.document;
  if (doc?.createElement) {
    const anchor = doc.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = toSafeDownloadName(downloadName, '附件');
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    doc.body?.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }
  await Linking.openURL(downloadUrl);
}

async function downloadAuthedAsset(backendUrl: string, assetUrl: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await fetchAuthedAssetBlob(backendUrl, assetUrl);
  const preview = await createBlobPreviewUrl(blob);
  try {
    await triggerDownloadFromUrl(preview.url, fileName || fallbackName || '附件');
  } finally {
    setTimeout(() => {
      preview.revoke();
    }, 1200);
  }
}

function MarkdownAssetImage({
  backendUrl,
  chatImageToken,
  rawSrc,
  altText,
  imageStyle,
  fallbackStyle,
  indicatorColor,
  deferRelativeLoad,
  streamingPhase,
  retryOnTransientError,
  onImageAuthError
}: {
  backendUrl: string;
  chatImageToken: string;
  rawSrc: string;
  altText: string;
  imageStyle: unknown;
  fallbackStyle: unknown;
  indicatorColor: string;
  deferRelativeLoad?: boolean;
  streamingPhase?: boolean;
  retryOnTransientError?: boolean;
  onImageAuthError: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const firstErrorTsRef = useRef(0);
  const srcText = String(rawSrc || '').trim();
  const directImageSource = isDirectImageUrl(srcText);
  const shouldDeferRelative = Boolean(deferRelativeLoad) && Boolean(srcText) && !directImageSource;
  const resolved = resolveMarkdownImageUrl(srcText, backendUrl, chatImageToken);
  const shouldRetryTransientAuth = Boolean(retryOnTransientError) && Boolean(streamingPhase) && !directImageSource;
  const sourceUri = useMemo(() => {
    const uri = String(resolved || '').trim();
    if (!uri) return '';
    if (!shouldRetryTransientAuth || retryNonce <= 0) return uri;
    const separator = uri.includes('?') ? '&' : '?';
    return `${uri}${separator}__rmn=${retryNonce}`;
  }, [resolved, retryNonce, shouldRetryTransientAuth]);
  const missingSignedToken = Boolean(srcText) && !directImageSource && !resolved;

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    retryAttemptRef.current = 0;
    firstErrorTsRef.current = 0;
    setRetryNonce(0);
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [resolved]);

  useEffect(() => {
    if (shouldDeferRelative) {
      retryAttemptRef.current = 0;
      firstErrorTsRef.current = 0;
      setRetryNonce(0);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setLoading(false);
      setFailed(false);
      return;
    }
    if (!sourceUri) {
      setLoading(false);
      setFailed(missingSignedToken);
      return;
    }
    setLoading(true);
    setFailed(false);
  }, [missingSignedToken, shouldDeferRelative, sourceUri]);

  const handleImageLoadStart = useCallback(() => {
    if (sourceUri) {
      setLoading(true);
      setFailed(false);
    }
  }, [sourceUri]);

  const handleImageLoad = useCallback(() => {
    setLoading(false);
    setFailed(false);
  }, []);

  const handleImageError = useCallback((event: unknown) => {
    if (directImageSource) {
      setLoading(false);
      setFailed(true);
      return;
    }

    const raw =
      String((event as { nativeEvent?: { error?: string } })?.nativeEvent?.error || '') ||
      String(event || '');
    const authLikeFailure = AUTH_FAILURE_REGEX.test(raw);

    if (!authLikeFailure || !shouldRetryTransientAuth) {
      setLoading(false);
      setFailed(true);
      if (authLikeFailure) {
        onImageAuthError();
      }
      return;
    }

    // Auth-like failure during streaming: two-phase retry
    const attempt = retryAttemptRef.current;
    if (firstErrorTsRef.current === 0) {
      firstErrorTsRef.current = Date.now();
    }

    const elapsed = Date.now() - firstErrorTsRef.current;
    if (elapsed >= AUTH_RETRY_TOTAL_WINDOW_MS) {
      setLoading(false);
      setFailed(true);
      onImageAuthError();
      return;
    }

    retryAttemptRef.current = attempt + 1;
    setFailed(false);
    setLoading(true);

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }

    const delay = attempt < AUTH_RETRY_QUICK_DELAYS_MS.length
      ? AUTH_RETRY_QUICK_DELAYS_MS[attempt]
      : AUTH_RETRY_PERIODIC_INTERVAL_MS;

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setRetryNonce((prev) => prev + 1);
    }, delay);
  }, [directImageSource, onImageAuthError, shouldRetryTransientAuth]);

  if (shouldDeferRelative) {
    return (
      <View testID="markdown-image-deferred-placeholder" style={[fallbackStyle, styles.markdownImageFallback]}>
        <Text style={styles.markdownImageFallbackText}>图片生成中，完成后加载</Text>
      </View>
    );
  }

  if (!sourceUri) {
    if (!missingSignedToken) {
      return null;
    }
    return (
      <View testID="markdown-image-fallback" style={[fallbackStyle, styles.markdownImageFallback]}>
        <Text style={styles.markdownImageFallbackText}>图片签名缺失</Text>
      </View>
    );
  }

  if (failed) {
    return (
      <View testID="markdown-image-fallback" style={[fallbackStyle, styles.markdownImageFallback]}>
        <Text style={styles.markdownImageFallbackText}>
          {directImageSource ? '图片加载失败' : '图片加载失败（签名失效）'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[fallbackStyle, styles.markdownImageContainer]}>
      <Image
        accessibilityLabel={altText || undefined}
        source={{ uri: sourceUri }}
        style={styles.markdownImageFill}
        onLoadStart={handleImageLoadStart}
        onLoad={handleImageLoad}
        onError={handleImageError}
        resizeMode="contain"
      />
      {loading ? (
        <View style={styles.markdownImageLoading}>
          <ActivityIndicator size="small" color={indicatorColor} />
        </View>
      ) : null}
    </View>
  );
}

function MarkdownBlock({
  content,
  mdStyle,
  onLinkPress,
  markdownRules,
  deferRelativeLoad
}: {
  content: string;
  mdStyle: Record<string, unknown>;
  onLinkPress: (href: string, asAttachment?: boolean, suggestedFileName?: string) => boolean;
  markdownRules: Record<string, unknown>;
  deferRelativeLoad?: boolean;
}) {
  const text = String(content || '');
  if (!text.trim()) return null;
  void deferRelativeLoad;
  return (
    <Markdown
      style={mdStyle}
      onLinkPress={onLinkPress}
      rules={markdownRules}
    >
      {text}
    </Markdown>
  );
}

const MemoMarkdownBlock = memo(
  MarkdownBlock,
  (prev, next) =>
    prev.content === next.content &&
    Boolean(prev.deferRelativeLoad) === Boolean(next.deferRelativeLoad) &&
    prev.mdStyle === next.mdStyle &&
    prev.onLinkPress === next.onLinkPress &&
    prev.markdownRules === next.markdownRules
);

function TimelineEntryRowComponent({
  item,
  theme,
  contentWidth,
  backendUrl,
  chatImageToken,
  toolExpanded,
  onToggleTool,
  onToggleReasoning,
  onCopyText,
  onImageAuthError
}: TimelineEntryRowProps) {
  const appear = useRef(new Animated.Value(0)).current;

  const isAssistantStreaming =
    item.kind === 'message' && item.role === 'assistant' && Boolean(item.isStreamingContent);

  const prevFrozenRef = useRef<StreamingMarkdownBlock[]>([]);

  const streamingPartition = useMemo(() => {
    if (!isAssistantStreaming) {
      prevFrozenRef.current = [];
      return { frozenBlocks: [], tailBlock: null };
    }
    if (item.kind === 'message' && item.role === 'assistant') {
      const result = partitionStreamingBlocks(item.text, prevFrozenRef.current);
      prevFrozenRef.current = result.frozenBlocks;
      return result;
    }
    return { frozenBlocks: [], tailBlock: null };
  }, [isAssistantStreaming, item.kind, item.role, item.text]);

  const hasViewportBlocks = useMemo(() => {
    if (isAssistantStreaming || item.kind !== 'message' || item.role !== 'assistant') return false;
    return /```viewport\s/i.test(item.text);
  }, [isAssistantStreaming, item.kind, item.role, item.text]);

  const finalBlocks = useMemo(() => {
    if (isAssistantStreaming || hasViewportBlocks) return null;
    if (item.kind !== 'message' || item.role !== 'assistant') return null;
    return splitStreamingMarkdownBlocks(item.text);
  }, [isAssistantStreaming, hasViewportBlocks, item.kind, item.role, item.text]);

  const segments = useMemo(() => {
    if (!hasViewportBlocks) return [];
    if (item.kind === 'message' && item.role === 'assistant') {
      return splitViewportBlocks(item.text);
    }
    return [];
  }, [hasViewportBlocks, item.kind, item.role, item.text]);

  const handleMarkdownLinkPress = useCallback((href: string, asAttachment = false, suggestedFileName = '') => {
    const rawHref = String(href || '').trim();
    if (!rawHref) return false;
    const rawIsAbsolute = isAbsoluteHttpUrl(rawHref);
    const customScheme = /^[a-z][a-z0-9+.-]*:/i.test(rawHref) && !rawIsAbsolute;
    const resolved = resolveMarkdownLinkUrl(href, backendUrl, asAttachment);
    if (!resolved) return false;

    if (rawIsAbsolute || customScheme) {
      Linking.openURL(resolved).catch(() => {});
      return false;
    }

    const fallbackName = toSafeDownloadName(
      suggestedFileName || fileNameFromHref(resolved) || fileNameFromHref(rawHref) || '附件',
      '附件'
    );
    downloadAuthedAsset(backendUrl, resolved, fallbackName).catch(() => {});
    return false;
  }, [backendUrl]);

  const renderMarkdownLinkNode = useCallback((node: any, children: any, markdownStyles: any, asBlock = false) => {
    const rawHref = String(node?.attributes?.href || '');
    const labelText = extractTextFromMarkdownChildren(children).trim();
    const attachment = looksLikeAttachmentHref(rawHref, labelText);
    const resolvedHref = resolveMarkdownLinkUrl(rawHref, backendUrl, attachment);

    if (!attachment) {
      if (asBlock) {
        return (
          <TouchableOpacity
            key={node.key}
            activeOpacity={0.88}
            onPress={() => {
              handleMarkdownLinkPress(rawHref, false, labelText);
            }}
            style={markdownStyles.blocklink}
          >
            <View style={markdownStyles.image}>{children}</View>
          </TouchableOpacity>
        );
      }
      return (
        <Text
          key={node.key}
          style={markdownStyles.link}
          onPress={() => {
            handleMarkdownLinkPress(rawHref, false, labelText);
          }}
        >
          {children}
        </Text>
      );
    }

    const title = resolveAttachmentTitle(rawHref, resolvedHref, labelText);
    const ext = fileExtensionFromName(title || fileNameFromHref(resolvedHref));
    const badgeText = (ext || 'file').toUpperCase();

    return (
      <TouchableOpacity
        key={node.key}
        activeOpacity={0.84}
        onPress={() => {
          handleMarkdownLinkPress(rawHref, true, title);
        }}
        style={styles.attachmentCardPress}
      >
        <View
          style={[
            styles.attachmentCard,
            {
              backgroundColor: theme.surfaceSoft,
              borderColor: `${theme.primary}2b`
            }
          ]}
        >
          <View
            style={[
              styles.attachmentCardGlyphWrap,
              {
                backgroundColor: `${theme.primary}20`
              }
            ]}
          >
            <Text style={[styles.attachmentCardGlyph, { color: theme.primaryDeep || theme.primary }]}>⬇</Text>
          </View>
          <View style={styles.attachmentCardMeta}>
            <Text numberOfLines={1} style={[styles.attachmentCardTitle, { color: theme.text }]}>
              {title}
            </Text>
            <Text style={[styles.attachmentCardHint, { color: theme.textMute }]}>
              {`${badgeText} · 点击下载`}
            </Text>
          </View>
          <Text style={[styles.attachmentCardAction, { color: theme.primary }]}>下载</Text>
        </View>
      </TouchableOpacity>
    );
  }, [backendUrl, handleMarkdownLinkPress, theme.primary, theme.primaryDeep, theme.surfaceSoft, theme.text, theme.textMute]);

  const renderMarkdownImageNode = useCallback((
    node: any,
    _children: any,
    _parent: any,
    markdownStyles: any,
    options?: { deferRelativeLoad?: boolean; streamingPhase?: boolean; retryOnTransientError?: boolean }
  ) => {
    const deferRelativeLoad = Boolean(options?.deferRelativeLoad);
    const streamingPhase = Boolean(options?.streamingPhase);
    const retryOnTransientError = Boolean(options?.retryOnTransientError);
    const rawSrc = String(node?.attributes?.src || '');
    const width = Math.max(140, Math.min(Math.round(contentWidth * 0.78), 360));
    const fallbackStyle = {
      width,
      height: Math.round(width * 0.62),
      alignSelf: 'flex-start',
      borderRadius: 10,
      marginTop: 2,
      marginBottom: 10
    };
    return (
      <MarkdownAssetImage
        key={node.key}
        backendUrl={backendUrl}
        chatImageToken={chatImageToken}
        rawSrc={rawSrc}
        altText={String(node?.attributes?.alt || '')}
        imageStyle={markdownStyles.image}
        fallbackStyle={fallbackStyle}
        indicatorColor={theme.primary}
        deferRelativeLoad={deferRelativeLoad}
        streamingPhase={streamingPhase}
        retryOnTransientError={retryOnTransientError}
        onImageAuthError={onImageAuthError}
      />
    );
  }, [backendUrl, chatImageToken, contentWidth, onImageAuthError, theme.primary]);

  const nonStreamingMarkdownRules = useMemo(() => ({
    link: (node: any, children: any, _parent: any, markdownStyles: any) =>
      renderMarkdownLinkNode(node, children, markdownStyles, false),
    blocklink: (node: any, children: any, _parent: any, markdownStyles: any) =>
      renderMarkdownLinkNode(node, children, markdownStyles, true),
    image: (node: any, children: any, parent: any, markdownStyles: any) =>
      renderMarkdownImageNode(node, children, parent, markdownStyles, {
        deferRelativeLoad: false,
        streamingPhase: false,
        retryOnTransientError: false
      })
  }), [renderMarkdownImageNode, renderMarkdownLinkNode]);

  const streamingFrozenMarkdownRules = useMemo(() => ({
    link: (node: any, children: any, _parent: any, markdownStyles: any) =>
      renderMarkdownLinkNode(node, children, markdownStyles, false),
    blocklink: (node: any, children: any, _parent: any, markdownStyles: any) =>
      renderMarkdownLinkNode(node, children, markdownStyles, true),
    image: (node: any, children: any, parent: any, markdownStyles: any) =>
      renderMarkdownImageNode(node, children, parent, markdownStyles, {
        deferRelativeLoad: false,
        streamingPhase: true,
        retryOnTransientError: true
      })
  }), [renderMarkdownImageNode, renderMarkdownLinkNode]);

  const streamingTailMarkdownRules = useMemo(() => ({
    link: (node: any, children: any, _parent: any, markdownStyles: any) =>
      renderMarkdownLinkNode(node, children, markdownStyles, false),
    blocklink: (node: any, children: any, _parent: any, markdownStyles: any) =>
      renderMarkdownLinkNode(node, children, markdownStyles, true),
    image: (node: any, children: any, parent: any, markdownStyles: any) =>
      renderMarkdownImageNode(node, children, parent, markdownStyles, {
        deferRelativeLoad: false,
        streamingPhase: true,
        retryOnTransientError: true
      })
  }), [renderMarkdownImageNode, renderMarkdownLinkNode]);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [appear]);

  const enterStyle = {
    opacity: appear,
    transform: [
      {
        translateY: appear.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0]
        })
      }
    ]
  };

  const renderTimelineRail = (dotStyle?: Record<string, unknown>, icon?: string) => (
    <View style={styles.timelineRail}>
      <View style={[styles.timelineLine, { backgroundColor: theme.timelineLine }]} />
      {icon ? (
        <Text style={[styles.timelineIcon, dotStyle]}>{icon}</Text>
      ) : (
        <View style={[styles.timelineDot, dotStyle, { backgroundColor: theme.timelineDot }]} />
      )}
    </View>
  );

  const renderStateIcon = (state: unknown, color: string) => {
    const normalized = normalizeTaskStatus(state);
    if (normalized === 'running') {
      return <ActivityIndicator size="small" color={color} />;
    }
    if (normalized === 'failed') {
      return (
        <View style={[styles.statusIconDot, { backgroundColor: `${theme.danger}2b` }]}>
          <Text style={[styles.statusIconText, { color: theme.danger }]}>×</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusIconDot, { backgroundColor: `${theme.ok}2b` }]}>
        <Text style={[styles.statusIconText, { color: theme.ok }]}>✓</Text>
      </View>
    );
  };

  if (item.kind === 'tool' || item.kind === 'action') {
    const tone = getTaskTone(item.state);
    const toneStyle =
      tone === 'ok'
        ? { color: theme.ok, bg: `${theme.ok}16` }
        : tone === 'danger'
          ? { color: theme.danger, bg: `${theme.danger}14` }
          : tone === 'warn'
            ? { color: theme.warn, bg: `${theme.warn}16` }
            : { color: theme.textSoft, bg: theme.surfaceSoft };

    const typeGlyph = item.kind === 'action' ? getActionGlyph(item.actionName || item.label) : '';

    return (
      <Animated.View style={[styles.toolRow, enterStyle]}>
        {renderTimelineRail(styles.timelineDotTool, '🔧')}
        <View style={styles.toolBody}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => onToggleTool(item.id)}>
            <View style={[styles.toolHead, { backgroundColor: toneStyle.bg }]}> 
              <View style={styles.toolStateIconWrap}>{renderStateIcon(item.state, toneStyle.color)}</View>
              {typeGlyph ? <Text style={[styles.toolKindGlyph, { color: toneStyle.color }]}>{typeGlyph}</Text> : null}
              <Text style={[styles.toolHeadText, { color: toneStyle.color }]} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          </TouchableOpacity>

          {toolExpanded ? (
            <View style={[styles.toolExpandPanel, { backgroundColor: theme.surfaceStrong }]}> 
              <View style={styles.toolDetailBlock}>
                <Text style={[styles.toolDetailTitle, { color: theme.textSoft }]}>args</Text>
                <Text style={[styles.toolDetailText, { color: theme.text }]}>{item.argsText || '(empty)'}</Text>
              </View>
              <View style={styles.toolDetailBlock}>
                <Text style={[styles.toolDetailTitle, { color: theme.textSoft }]}>result</Text>
                <Text style={[styles.toolDetailText, { color: theme.text }]}>{item.resultText || '(empty)'}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  if (item.kind === 'reasoning') {
    const durationSec = item.startTs && item.endTs ? ((item.endTs - item.startTs) / 1000).toFixed(1) : null;
    const durationLabel = durationSec ? `思考 ${durationSec}s` : '思考中...';

    return (
      <Animated.View style={[styles.reasoningRow, enterStyle]}>
        {renderTimelineRail(styles.timelineDotReasoning, '💡')}
        <TouchableOpacity activeOpacity={0.7} style={styles.reasoningBody} onPress={() => onToggleReasoning(item.id)}>
          <Text style={[styles.reasoningLabel, { color: theme.textMute }]}>{durationLabel}</Text>
          {item.collapsed ? null : <Text style={[styles.reasoningText, { color: theme.textMute }]}>{item.text || ''}</Text>}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const isUser = item.kind === 'message' && item.role === 'user';
  const isSystem = item.kind === 'message' && item.role === 'system';
  const isRunEnd = isSystem && item.variant === 'run_end';

  if (isUser) {
    return (
      <Animated.View style={[styles.userRow, enterStyle]}>
        <View style={styles.timelineSpacer} />
        <View style={styles.userBubbleWrap}>
          <TouchableOpacity activeOpacity={0.85} onLongPress={() => onCopyText(item.text)}>
            <LinearGradient colors={theme.userBubble} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userBubble}>
              <Text style={styles.userText}>{item.text}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={[styles.userTime, { color: theme.textMute }]}>{toSmartTime(item.ts)}</Text>
        </View>
      </Animated.View>
    );
  }

  if (isRunEnd) {
    const endText = String(item.text || '本次运行结束').trim();
    return (
      <Animated.View style={[styles.runEndRow, enterStyle]}>
        {item.ts ? (
          <View style={styles.runEndTimeWrap}>
            <Text style={[styles.runEndTime, { color: theme.textMute }]}>{toSmartTime(item.ts)}</Text>
          </View>
        ) : null}
        <Text style={[styles.runEndText, { color: theme.textMute }]}>{`-- ${endText} --`}</Text>
      </Animated.View>
    );
  }

  if (isSystem) {
    const systemColor =
      item.tone === 'ok'
        ? theme.ok
        : item.tone === 'warn'
          ? theme.warn
          : item.tone === 'neutral'
            ? theme.textSoft
            : theme.danger;

    return (
      <Animated.View style={[styles.systemRow, enterStyle]}>
        {renderTimelineRail(styles.timelineDotMessage)}
        <View style={styles.systemWrap}>
          <View style={[styles.systemBadge, { backgroundColor: theme.systemBubble }]}> 
            <Text style={[styles.systemText, { color: systemColor }]}>{item.text}</Text>
          </View>
          <Text style={[styles.systemTime, { color: theme.textMute }]}>{toSmartTime(item.ts)}</Text>
        </View>
      </Animated.View>
    );
  }

  const mdStyle = useMemo(() => ({
    body: { color: theme.text, fontFamily: FONT_SANS, fontSize: 15, lineHeight: 22 },
    text: { color: theme.text, fontFamily: FONT_SANS, fontSize: 15, lineHeight: 22 },
    paragraph: { marginTop: 0, marginBottom: 10 },
    heading1: { color: theme.text, marginTop: 2, marginBottom: 8, fontSize: 22, fontWeight: '800' },
    heading2: { color: theme.text, marginTop: 2, marginBottom: 8, fontSize: 20, fontWeight: '700' },
    heading3: { color: theme.text, marginTop: 2, marginBottom: 8, fontSize: 18, fontWeight: '700' },
    bullet_list: { marginTop: 0, marginBottom: 10 },
    ordered_list: { marginTop: 0, marginBottom: 10 },
    code_inline: {
      color: theme.primaryDeep,
      backgroundColor: theme.primarySoft,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 2,
      fontFamily: FONT_MONO
    },
    fence: {
      color: theme.textSoft,
      backgroundColor: theme.surfaceSoft,
      borderRadius: 10,
      padding: 10,
      fontFamily: FONT_MONO,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 0,
      marginBottom: 10
    },
    link: {
      color: theme.primary,
      textDecorationLine: 'underline'
    }
  }), [theme.primary, theme.primaryDeep, theme.primarySoft, theme.surfaceSoft, theme.text, theme.textSoft]);

  return (
    <Animated.View style={[styles.assistantRow, enterStyle]}>
      {renderTimelineRail(styles.timelineDotMessage, '💬')}
      <Pressable
        style={styles.assistantFlowWrap}
        onLongPress={() => onCopyText(item.kind === 'message' ? item.text : '')}
      >
        <View style={styles.assistantBubblePanel}>
          {isAssistantStreaming ? (
            <>
              {streamingPartition.frozenBlocks.map((block) => (
                <MemoMarkdownBlock
                  key={`stream-md-${item.id}-${block.key}`}
                  content={block.content}
                  mdStyle={mdStyle}
                  onLinkPress={handleMarkdownLinkPress}
                  markdownRules={streamingFrozenMarkdownRules}
                  deferRelativeLoad={false}
                />
              ))}
              {streamingPartition.tailBlock ? (
                <MemoMarkdownBlock
                  key={`stream-md-${item.id}-${streamingPartition.tailBlock.key}`}
                  content={streamingPartition.tailBlock.content}
                  mdStyle={mdStyle}
                  onLinkPress={handleMarkdownLinkPress}
                  markdownRules={streamingTailMarkdownRules}
                  deferRelativeLoad={false}
                />
              ) : null}
            </>
          ) : finalBlocks ? (
            finalBlocks.map((block) => (
              <MemoMarkdownBlock
                key={`stream-md-${item.id}-${block.key}`}
                content={block.content}
                mdStyle={mdStyle}
                onLinkPress={handleMarkdownLinkPress}
                markdownRules={nonStreamingMarkdownRules}
                deferRelativeLoad={false}
              />
            ))
          ) : (
            segments.map((segment, index) => {
              if (segment.type === 'viewport') {
                if (segment.viewportKey) {
                  return (
                    <ViewportBlockView
                      key={`vp-${item.id}-${index}`}
                      viewportKey={String(segment.viewportKey)}
                      payload={(segment.payload || null) as Record<string, unknown> | null}
                      backendUrl={backendUrl}
                      theme={theme}
                      contentWidth={contentWidth}
                    />
                  );
                }
                const fallbackText = String(segment.content || segment.payloadRaw || '');
                if (!fallbackText.trim()) return null;
                return (
                  <Text
                    key={`vp-fallback-${item.id}-${index}`}
                    style={{
                      color: theme.textSoft,
                      fontSize: 12,
                      fontFamily: FONT_MONO,
                      backgroundColor: theme.surfaceSoft,
                      borderRadius: 8,
                      padding: 8,
                      marginVertical: 4
                    }}
                  >
                    {fallbackText}
                  </Text>
                );
              }

              const content = String(segment.content || '');
              if (!content.trim()) return null;
              return (
                <MemoMarkdownBlock
                  key={`md-${item.id}-${index}`}
                  content={content}
                  mdStyle={mdStyle}
                  onLinkPress={handleMarkdownLinkPress}
                  markdownRules={nonStreamingMarkdownRules}
                  deferRelativeLoad={false}
                />
              );
            })
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  timelineRail: {
    width: 12,
    alignSelf: 'stretch',
    alignItems: 'center'
  },
  timelineLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1
  },
  timelineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5
  },
  timelineIcon: {
    fontSize: 10,
    lineHeight: 14
  },
  timelineDotTool: {
    marginTop: 5
  },
  timelineDotReasoning: {
    marginTop: 1
  },
  timelineDotMessage: {
    marginTop: 10
  },
  timelineSpacer: {
    width: 20
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 14
  },
  toolBody: {
    flex: 1
  },
  toolHead: {
    minHeight: 24,
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    maxWidth: '94%'
  },
  toolStateIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  toolKindGlyph: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    fontWeight: '700',
    marginTop: -0.5
  },
  toolHeadText: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONT_MONO,
    fontSize: 11.5,
    fontWeight: '700'
  },
  statusIconDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusIconText: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '700'
  },
  toolExpandPanel: {
    marginTop: 6,
    borderRadius: 11,
    padding: 8
  },
  toolDetailBlock: {
    marginBottom: 8
  },
  toolDetailTitle: {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 3
  },
  toolDetailText: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8
  },
  reasoningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 14
  },
  reasoningBody: {
    flex: 1,
    paddingLeft: 4,
    paddingRight: 4,
    paddingTop: 1
  },
  reasoningLabel: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2
  },
  reasoningText: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500'
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 4,
    paddingHorizontal: 14
  },
  userBubbleWrap: {
    flex: 1,
    alignItems: 'flex-end'
  },
  userBubble: {
    maxWidth: '87%',
    borderRadius: 14,
    borderTopRightRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 9,
    elevation: 2
  },
  userText: {
    color: '#ffffff',
    fontFamily: FONT_SANS,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600'
  },
  userTime: {
    marginTop: 4,
    textAlign: 'right',
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '700'
  },
  assistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingHorizontal: 14
  },
  assistantFlowWrap: {
    flex: 1,
    paddingRight: 2
  },
  assistantBubblePanel: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginBottom: 3
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 14
  },
  systemWrap: {
    flex: 1,
    alignItems: 'flex-start'
  },
  systemBadge: {
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  systemText: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600'
  },
  systemTime: {
    marginTop: 4,
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '700'
  },
  runEndRow: {
    flexDirection: 'column',
    marginBottom: 10,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 14
  },
  runEndTimeWrap: {
    alignItems: 'flex-end',
    marginBottom: 3
  },
  runEndTime: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '600'
  },
  runEndText: {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'center'
  },
  attachmentCardPress: {
    marginTop: 2,
    marginBottom: 8
  },
  attachmentCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  attachmentCardGlyphWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  attachmentCardGlyph: {
    fontFamily: FONT_MONO,
    fontSize: 13,
    fontWeight: '800'
  },
  attachmentCardMeta: {
    flex: 1,
    minWidth: 0
  },
  attachmentCardTitle: {
    fontFamily: FONT_SANS,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '700'
  },
  attachmentCardHint: {
    marginTop: 2,
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '600'
  },
  attachmentCardAction: {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '800'
  },
  markdownImageContainer: {
    position: 'relative',
    overflow: 'hidden'
  },
  markdownImageFill: {
    width: '100%',
    height: '100%'
  },
  markdownImageLoading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  markdownImageFallback: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    backgroundColor: '#f6f8fa',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  markdownImageFallbackText: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: '#667085',
    textAlign: 'center'
  }
});

function isSameTheme(
  prev: TimelineEntryRowProps['theme'],
  next: TimelineEntryRowProps['theme']
): boolean {
  return (
    prev.timelineLine === next.timelineLine &&
    prev.timelineDot === next.timelineDot &&
    prev.ok === next.ok &&
    prev.danger === next.danger &&
    prev.warn === next.warn &&
    prev.text === next.text &&
    prev.textSoft === next.textSoft &&
    prev.textMute === next.textMute &&
    prev.primary === next.primary &&
    prev.primaryDeep === next.primaryDeep &&
    prev.primarySoft === next.primarySoft &&
    prev.surfaceSoft === next.surfaceSoft &&
    prev.surfaceStrong === next.surfaceStrong &&
    prev.systemBubble === next.systemBubble &&
    prev.userBubble[0] === next.userBubble[0] &&
    prev.userBubble[1] === next.userBubble[1]
  );
}

function areTimelineEntryRowPropsEqual(prev: TimelineEntryRowProps, next: TimelineEntryRowProps): boolean {
  return (
    prev.item === next.item &&
    prev.toolExpanded === next.toolExpanded &&
    prev.contentWidth === next.contentWidth &&
    prev.backendUrl === next.backendUrl &&
    prev.chatImageToken === next.chatImageToken &&
    isSameTheme(prev.theme, next.theme)
  );
}

export const TimelineEntryRow = memo(TimelineEntryRowComponent, areTimelineEntryRowPropsEqual);
