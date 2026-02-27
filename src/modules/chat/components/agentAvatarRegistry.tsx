import Svg, { Circle, Path, Rect } from 'react-native-svg';

export const AGENT_AVATAR_NAMES = [
  'orbit',
  'spark',
  'shield',
  'rocket',
  'terminal',
  'compass',
  'bolt',
  'leaf'
] as const;

export type AgentAvatarName = (typeof AGENT_AVATAR_NAMES)[number];

const FALLBACK_BG_COLORS = [
  '#3F7BFA',
  '#10A37F',
  '#FF7A59',
  '#6E56CF',
  '#E66A00',
  '#1E9ED9',
  '#D64C7F',
  '#2F855A'
];

function hashText(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function normalizeRawName(rawName: string): string {
  return String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function normalizeColor(rawColor: string): string {
  const color = String(rawColor || '').trim();
  if (!color) {
    return '';
  }
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) {
    return color;
  }
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(color)) {
    return color;
  }
  return '';
}

export function resolveAgentAvatarName(agentKey: string, rawName?: string): AgentAvatarName {
  const normalized = normalizeRawName(rawName || '');
  const matched = AGENT_AVATAR_NAMES.find((name) => normalizeRawName(name) === normalized);
  if (matched) {
    return matched;
  }
  const fallbackKey = String(agentKey || '').trim() || 'unknown-agent';
  const index = hashText(fallbackKey) % AGENT_AVATAR_NAMES.length;
  return AGENT_AVATAR_NAMES[index];
}

export function resolveAgentAvatarBgColor(agentKey: string, rawColor?: string): string {
  const direct = normalizeColor(rawColor || '');
  if (direct) {
    return direct;
  }
  const fallbackKey = String(agentKey || '').trim() || 'unknown-agent';
  return FALLBACK_BG_COLORS[hashText(fallbackKey) % FALLBACK_BG_COLORS.length];
}

interface AgentAvatarIconProps {
  name: AgentAvatarName;
  size: number;
  color: string;
}

export function AgentAvatarIcon({ name, size, color }: AgentAvatarIconProps) {
  if (name === 'spark') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12 4.2L13.9 9.1L18.8 11L13.9 12.9L12 17.8L10.1 12.9L5.2 11L10.1 9.1L12 4.2Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'shield') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12 4.2L18.3 6.8V11.6C18.3 15 15.9 18.2 12 19.8C8.1 18.2 5.7 15 5.7 11.6V6.8L12 4.2Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'rocket') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M14.4 4.4C17.4 4.6 19.4 6.6 19.6 9.6L13 16.2L7.8 11L14.4 4.4Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        <Circle cx={14.8} cy={9.2} r={1.2} stroke={color} strokeWidth={1.5} />
        <Path d="M7.8 11L6 16L11 14.2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'terminal') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Rect x={4.2} y={5.2} width={15.6} height={13.6} rx={2.4} stroke={color} strokeWidth={1.8} />
        <Path d="M8.2 10L10.8 12L8.2 14M13 14H16.2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'compass') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={7.8} stroke={color} strokeWidth={1.8} />
        <Path d="M14.8 9.2L13.2 13.2L9.2 14.8L10.8 10.8L14.8 9.2Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'bolt') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12.8 4.6L8.1 12.1H12.3L11.3 19.4L16 11.9H11.8L12.8 4.6Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      </Svg>
    );
  }

  if (name === 'leaf') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M18.8 6.2C18.8 13 14.8 17.8 10 17.8C7.1 17.8 5 15.8 5 12.9C5 8.1 9.8 4.2 16.6 4.2H18.8V6.2Z" stroke={color} strokeWidth={1.8} />
        <Path d="M8 16.6L14.6 10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={7.8} stroke={color} strokeWidth={1.8} />
      <Path d="M7.2 12H16.8M12 7.2C9.8 8.8 9.8 15.2 12 16.8M12 7.2C14.2 8.8 14.2 15.2 12 16.8" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

