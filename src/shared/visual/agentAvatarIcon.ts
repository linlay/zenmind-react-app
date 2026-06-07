import type { AgentAvatarIcon } from './agentAvatarTypes.ts';

export const AGENT_ICON_NAMES = [
  'folder',
  'chat',
  'wave',
  'focus',
  'library',
  'coder',
  'canvas',
  'ide',
  'fast',
  'peaks',
  'flux',
  'pulse',
  'spark',
  'horizon',
  'emit',
  'database',
  'stratus',
  'sentinel',
  'identity',
  'spectrum',
  'chime',
  'sol',
  'atlas',
  'chronos',
  'statue',
  'portal',
  'resonance',
  'luna',
  'cortex',
  'terminal',
] as const;

export type AgentBuiltinIconName = (typeof AGENT_ICON_NAMES)[number];

export type ResolvedAgentAvatarUri = {
  type: 'svg' | 'image';
  uri: string;
};

const SVG_URI_PATTERN = /\.svg(?:[?#].*)?$/i;
const IMAGE_URI_PATTERN = /\.(png|jpe?g|webp)(?:[?#].*)?$/i;
const ICON_URI_PATTERN = /\.(svg|png|jpe?g|webp)(?:[?#].*)?$/i;
const ICON_NAME_SET = new Set<string>(AGENT_ICON_NAMES);

function toText(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeAgentAvatarIcon(icon: unknown): AgentAvatarIcon | null {
  if (typeof icon === 'string') {
    const uri = toText(icon);
    return ICON_URI_PATTERN.test(uri) ? { name: null, color: null, uri } : null;
  }

  if (!icon || typeof icon !== 'object') {
    return null;
  }

  const record = icon as Record<string, unknown>;
  const name = toText(record.name);
  const color = toText(record.color);
  const uri = toText(record.uri || record.url || record.src);
  const safeUri = ICON_URI_PATTERN.test(uri) ? uri : '';
  if (!name && !color && !safeUri) {
    return null;
  }

  return {
    name: name || null,
    color: color || null,
    uri: safeUri || null,
  };
}

export function resolveAgentBuiltinIconName(name?: string | null): AgentBuiltinIconName | null {
  const normalized = toText(name);
  return ICON_NAME_SET.has(normalized) ? (normalized as AgentBuiltinIconName) : null;
}

export function resolveAgentAvatarUri(
  icon?: AgentAvatarIcon | null
): ResolvedAgentAvatarUri | null {
  const uri = toText(icon?.uri);
  if (!uri) {
    return null;
  }

  if (SVG_URI_PATTERN.test(uri)) {
    return { type: 'svg', uri };
  }

  if (IMAGE_URI_PATTERN.test(uri)) {
    return { type: 'image', uri };
  }

  return null;
}
