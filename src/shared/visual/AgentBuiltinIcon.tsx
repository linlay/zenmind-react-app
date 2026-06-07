import { memo } from 'react';
import {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Svg,
} from 'react-native-svg';

import type { AgentBuiltinIconName } from './agentAvatarIcon.ts';

export type AgentBuiltinIconKey = AgentBuiltinIconName | 'default';

export type AgentBuiltinIconProps = {
  name: AgentBuiltinIconKey;
  size: number;
};

type GradientProps = {
  id: string;
  from: string;
  to: string;
  x1?: string;
  y1?: string;
  x2?: string;
  y2?: string;
};

function Gradient({ id, from, to, x1 = '0%', y1 = '0%', x2 = '100%', y2 = '100%' }: GradientProps) {
  return (
    <Defs>
      <LinearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
        <Stop offset="0%" stopColor={from} />
        <Stop offset="100%" stopColor={to} />
      </LinearGradient>
    </Defs>
  );
}

export const AgentBuiltinIcon = memo(function AgentBuiltinIcon({
  name,
  size,
}: AgentBuiltinIconProps) {
  const gradientId = `g-agent-avatar-${name}`;
  const paint = `url(#${gradientId})`;

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {name === 'default' ? (
        <>
          <Gradient id={gradientId} from="#94A3B8" to="#475569" />
          <Path d="M24 14V6" stroke={paint} strokeWidth={3} strokeLinecap="round" opacity={0.7} />
          <Circle cx={24} cy={6} r={3} fill={paint} opacity={0.9} />
          <Rect
            x={10}
            y={14}
            width={28}
            height={24}
            rx={6}
            fill={paint}
            opacity={0.15}
            stroke={paint}
            strokeWidth={3}
          />
          <Rect x={6} y={21} width={4} height={10} rx={2} fill={paint} opacity={0.6} />
          <Rect x={38} y={21} width={4} height={10} rx={2} fill={paint} opacity={0.6} />
          <Circle cx={19} cy={24} r={3} fill={paint} opacity={0.8} />
          <Circle cx={29} cy={24} r={3} fill={paint} opacity={0.8} />
          <Path
            d="M18 31h12"
            stroke={paint}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.7}
          />
        </>
      ) : null}

      {name === 'folder' ? (
        <>
          <Gradient id={gradientId} from="#FBBF24" to="#D97706" />
          <Path d="M6 14 L20 8 L42 16 L28 22 Z" fill={paint} opacity={0.4} />
          <Path d="M6 14 V34 L28 42 V22 Z" fill={paint} opacity={0.8} />
          <Path d="M28 22 L42 16 V36 L28 42 Z" fill={paint} opacity={0.6} />
          <Path d="M14 12 L24 8 L34 12 L24 16 Z" fill="#FFFFFF" opacity={0.9} />
        </>
      ) : null}

      {name === 'chat' ? (
        <>
          <Gradient id={gradientId} from="#34D399" to="#059669" />
          <Rect x={6} y={10} width={24} height={18} rx={6} fill={paint} opacity={0.8} />
          <Path d="M12 28 L6 34 L14 31 Z" fill={paint} opacity={0.8} />
          <Rect
            x={18}
            y={20}
            width={24}
            height={18}
            rx={6}
            fill={paint}
            opacity={0.4}
            stroke={paint}
            strokeWidth={2}
          />
          <Path d="M36 38 L42 44 L34 41 Z" fill={paint} opacity={0.4} />
          <Circle cx={26} cy={29} r={2} fill="#FFFFFF" />
          <Circle cx={30} cy={29} r={2} fill="#FFFFFF" opacity={0.7} />
          <Circle cx={34} cy={29} r={2} fill="#FFFFFF" opacity={0.4} />
        </>
      ) : null}

      {name === 'wave' ? (
        <>
          <Gradient id={gradientId} from="#60A5FA" to="#2563EB" y1="100%" y2="0%" />
          <Circle cx={24} cy={36} r={4} fill={paint} />
          <Ellipse
            cx={24}
            cy={36}
            rx={12}
            ry={6}
            stroke={paint}
            strokeWidth={3}
            strokeDasharray="4 6"
            fill="none"
            opacity={0.5}
          />
          <Ellipse
            cx={24}
            cy={36}
            rx={22}
            ry={11}
            stroke={paint}
            strokeWidth={3}
            fill="none"
            opacity={0.8}
          />
          <Path d="M24 6 L28 10 L24 14 L20 10 Z" fill={paint} opacity={0.9} />
          <Line x1={24} y1={14} x2={24} y2={32} stroke={paint} strokeWidth={2} opacity={0.3} />
        </>
      ) : null}

      {name === 'focus' ? (
        <>
          <Gradient id={gradientId} from="#A78BFA" to="#6D28D9" />
          <Path
            d="M10 28H38M10 34H38M16 22V40M32 22V40"
            stroke={paint}
            strokeWidth={2}
            opacity={0.2}
          />
          <Circle cx={20} cy={20} r={12} stroke={paint} strokeWidth={4} fill="none" opacity={0.8} />
          <Circle cx={20} cy={20} r={8} fill={paint} opacity={0.3} />
          <Line
            x1={28}
            y1={28}
            x2={42}
            y2={42}
            stroke={paint}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </>
      ) : null}

      {name === 'library' ? (
        <>
          <Gradient id={gradientId} from="#F472B6" to="#DB2777" />
          <Path d="M8 34 L24 28 L40 34 L24 40 Z" fill={paint} opacity={0.4} />
          <Path d="M8 34 V38 L24 44 V40 Z" fill={paint} opacity={0.8} />
          <Path d="M24 40 L40 34 V38 L24 44 Z" fill="#FFFFFF" opacity={0.6} />
          <Path d="M10 24 L26 18 L42 24 L26 30 Z" fill={paint} opacity={0.7} />
          <Path d="M10 24 V28 L26 34 V30 Z" fill={paint} opacity={0.9} />
          <Path d="M26 30 L42 24 V28 L26 34 Z" fill="#FFFFFF" opacity={0.6} />
          <Path d="M12 14 L28 8 L44 14 L28 20 Z" fill={paint} opacity={0.9} />
          <Path d="M12 14 V18 L28 24 V20 Z" fill={paint} opacity={0.9} />
          <Path d="M28 20 L44 14 V18 L28 24 Z" fill="#FFFFFF" opacity={0.8} />
        </>
      ) : null}

      {name === 'coder' ? (
        <>
          <Gradient id={gradientId} from="#2DD4BF" to="#0D9488" />
          <Path d="M6 16 L24 8 L42 16 L24 24 Z" fill={paint} opacity={0.3} />
          <Path d="M14 16 L24 12 L34 16 L24 20 Z" fill={paint} opacity={0.8} />
          <Path
            d="M12 24 L6 28 L12 32"
            stroke={paint}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.9}
          />
          <Path
            d="M36 24 L42 28 L36 32"
            stroke={paint}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.9}
          />
          <Path
            d="M26 22 L20 34"
            stroke={paint}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.9}
          />
        </>
      ) : null}

      {name === 'canvas' ? (
        <>
          <Gradient id={gradientId} from="#F87171" to="#B91C1C" />
          <Path
            d="M8 36 C 16 20, 32 20, 40 36"
            stroke={paint}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
            opacity={0.4}
          />
          <Circle cx={24} cy={22} r={3} fill={paint} />
          <Path d="M24 22 L16 10 L32 10 Z" fill={paint} opacity={0.9} />
          <Circle cx={16} cy={10} r={2} fill="#FFFFFF" />
          <Circle cx={32} cy={10} r={2} fill="#FFFFFF" />
        </>
      ) : null}

      {name === 'ide' ? (
        <>
          <Gradient id={gradientId} from="#818CF8" to="#4338CA" />
          <Path d="M6 14 L24 6 L42 14 L24 22 Z" fill={paint} opacity={0.3} />
          <Path d="M6 14 V34 L24 42 V22 Z" fill={paint} opacity={0.8} />
          <Path d="M24 22 L42 14 V34 L24 42 Z" fill={paint} opacity={0.5} />
          <Line x1={24} y1={22} x2={24} y2={42} stroke="#FFFFFF" strokeWidth={2} opacity={0.6} />
          <Line x1={14} y1={18} x2={14} y2={34} stroke="#FFFFFF" strokeWidth={1.5} opacity={0.4} />
          <Line x1={34} y1={18} x2={34} y2={34} stroke="#FFFFFF" strokeWidth={1.5} opacity={0.4} />
          <Circle cx={24} cy={30} r={3} fill="#FFFFFF" opacity={0.9} />
        </>
      ) : null}

      {name === 'fast' ? (
        <>
          <Gradient id={gradientId} from="#FB923C" to="#EA580C" />
          <Path d="M6 24 L20 12 V36 Z" fill={paint} opacity={0.3} />
          <Path d="M18 24 L32 12 V36 Z" fill={paint} opacity={0.6} />
          <Path d="M30 24 L44 12 V36 Z" fill={paint} opacity={0.9} />
          <Line x1={4} y1={16} x2={12} y2={16} stroke="#FFFFFF" strokeWidth={2} opacity={0.5} />
          <Line x1={2} y1={24} x2={10} y2={24} stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
          <Line x1={6} y1={32} x2={14} y2={32} stroke="#FFFFFF" strokeWidth={2} opacity={0.5} />
        </>
      ) : null}

      {name === 'peaks' ? (
        <>
          <Gradient id={gradientId} from="#10B981" to="#047857" />
          <Path d="M14 28 L24 12 L34 28 Z" fill={paint} opacity={0.4} />
          <Path d="M6 38 L18 18 L30 38 Z" fill={paint} opacity={0.8} />
          <Path d="M18 18 L30 38 H18 Z" fill="#FFFFFF" opacity={0.2} />
          <Path d="M20 38 L32 14 L44 38 Z" fill={paint} opacity={0.9} />
          <Path d="M32 14 L44 38 H32 Z" fill="#FFFFFF" opacity={0.3} />
          <Circle cx={28} cy={10} r={3} fill="#F59E0B" opacity={0.8} />
        </>
      ) : null}

      {name === 'flux' ? (
        <>
          <Gradient id={gradientId} from="#38BDF8" to="#0284C7" />
          <Path
            d="M8 24 C 8 12, 24 12, 24 24 C 24 36, 40 36, 40 24"
            stroke={paint}
            strokeWidth={6}
            strokeLinecap="round"
            fill="none"
            opacity={0.9}
          />
          <Path
            d="M8 24 C 8 36, 24 36, 24 24 C 24 12, 40 12, 40 24"
            stroke={paint}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
            opacity={0.4}
          />
          <Circle cx={16} cy={18} r={3} fill="#FFFFFF" />
          <Circle cx={32} cy={30} r={3} fill="#FFFFFF" opacity={0.7} />
        </>
      ) : null}

      {name === 'pulse' ? (
        <>
          <Gradient id={gradientId} from="#A78BFA" to="#6D28D9" />
          <Path
            d="M6 24 H42 M12 10 V38 M24 10 V38 M36 10 V38"
            stroke={paint}
            strokeWidth={1}
            opacity={0.15}
          />
          <Path
            d="M6 24 H16 L20 10 L24 38 L28 20 L32 24 H42"
            stroke={paint}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.9}
          />
          <Path
            d="M6 24 H16 L20 10 L24 38 L28 20 L32 24 H42"
            stroke={paint}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.2}
          />
        </>
      ) : null}

      {name === 'spark' ? (
        <>
          <Gradient id={gradientId} from="#FCD34D" to="#D97706" />
          <Path d="M24 10 L32 24 L24 38 L16 24 Z" fill={paint} opacity={0.8} />
          <Path d="M24 14 L29 24 L24 34 L19 24 Z" fill="#FFFFFF" opacity={0.4} />
          <Path
            d="M24 2 L26 8 H22 Z M24 46 L26 40 H22 Z M2 24 L8 22 V26 Z M46 24 L40 22 V26 Z"
            fill={paint}
            opacity={0.9}
          />
        </>
      ) : null}

      {name === 'horizon' ? (
        <>
          <Gradient id={gradientId} from="#A3E635" to="#4D7C0F" />
          <Circle cx={24} cy={18} r={12} fill={paint} opacity={0.8} />
          <Path d="M6 28 H42" stroke={paint} strokeWidth={3} opacity={0.9} />
          <Path
            d="M24 28 L6 42 M24 28 L18 42 M24 28 L30 42 M24 28 L42 42"
            stroke={paint}
            strokeWidth={2}
            opacity={0.4}
          />
          <Path
            d="M24 6 V10 M12 10 L15 13 M36 10 L33 13"
            stroke={paint}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.5}
          />
        </>
      ) : null}

      {name === 'emit' ? (
        <>
          <Gradient id={gradientId} from="#F87171" to="#B91C1C" />
          <Ellipse
            cx={24}
            cy={38}
            rx={14}
            ry={5}
            stroke={paint}
            strokeWidth={3}
            fill="none"
            opacity={0.4}
          />
          <Path d="M18 38 L24 46 L30 38 Z" fill={paint} opacity={0.9} />
          <Path d="M16 34 L24 10 L32 34 Z" fill={paint} opacity={0.8} />
          <Circle cx={24} cy={22} r={3} fill="#FFFFFF" />
        </>
      ) : null}

      {name === 'database' ? (
        <>
          <Gradient id={gradientId} from="#22D3EE" to="#0891B2" />
          <Ellipse cx={24} cy={12} rx={16} ry={6} fill={paint} opacity={0.9} />
          <Path d="M8 12 V22 C8 25 15 28 24 28 C33 28 40 25 40 22 V12" fill={paint} opacity={0.6} />
          <Path d="M8 22 V32 C8 35 15 38 24 38 C33 38 40 35 40 32 V22" fill={paint} opacity={0.3} />
          <Line x1={24} y1={12} x2={24} y2={32} stroke="#FFFFFF" strokeWidth={2} opacity={0.4} />
        </>
      ) : null}

      {name === 'stratus' ? (
        <>
          <Gradient id={gradientId} from="#38BDF8" to="#0284C7" />
          <Circle cx={16} cy={28} r={10} fill={paint} opacity={0.4} />
          <Circle cx={32} cy={28} r={8} fill={paint} opacity={0.6} />
          <Circle cx={24} cy={18} r={12} fill={paint} opacity={0.8} />
          <Path d="M12 34 H36" stroke={paint} strokeWidth={4} strokeLinecap="round" opacity={0.9} />
        </>
      ) : null}

      {name === 'sentinel' ? (
        <>
          <Gradient id={gradientId} from="#34D399" to="#059669" />
          <Path
            d="M24 4 C34 4 40 8 40 18 C40 30 24 44 24 44 C24 44 8 30 8 18 C8 8 14 4 24 4Z"
            fill={paint}
            opacity={0.3}
          />
          <Path d="M24 8 L12 14 V24 C12 31 24 38 24 38 Z" fill={paint} opacity={0.6} />
          <Path d="M24 8 L36 14 V24 C36 31 24 38 24 38 Z" fill={paint} opacity={0.9} />
        </>
      ) : null}

      {name === 'identity' ? (
        <>
          <Gradient id={gradientId} from="#F472B6" to="#DB2777" />
          <Circle cx={24} cy={14} r={8} fill={paint} opacity={0.9} />
          <Path d="M10 38 C10 30, 14 26, 24 26 C34 26, 38 30, 38 38 Z" fill={paint} opacity={0.4} />
          <Path d="M16 28 L24 20 L32 28 Z" fill="#FFFFFF" opacity={0.3} />
        </>
      ) : null}

      {name === 'spectrum' ? (
        <>
          <Gradient id={gradientId} from="#FCD34D" to="#D97706" y1="100%" y2="0%" />
          <Path d="M8 32 L16 28 L16 42 L8 42 Z" fill={paint} opacity={0.3} />
          <Path d="M19 20 L27 16 L27 42 L19 42 Z" fill={paint} opacity={0.6} />
          <Path d="M30 12 L38 8 L38 42 L30 42 Z" fill={paint} opacity={0.9} />
          <Path
            d="M8 26 L19 14 L30 6"
            stroke="#FFFFFF"
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
            opacity={0.8}
          />
        </>
      ) : null}

      {name === 'chime' ? (
        <>
          <Gradient id={gradientId} from="#2DD4BF" to="#0D9488" />
          <Path
            d="M24 6 C18 6, 14 12, 14 20 L12 30 H36 L34 20 C34 12, 30 6, 24 6 Z"
            fill={paint}
            opacity={0.4}
          />
          <Circle cx={24} cy={36} r={4} fill={paint} opacity={0.9} />
          <Path
            d="M8 26 A 18 18 0 0 0 40 26"
            stroke={paint}
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none"
            opacity={0.5}
          />
        </>
      ) : null}

      {name === 'sol' ? (
        <>
          <Gradient id={gradientId} from="#FCD34D" to="#D97706" />
          <Circle cx={24} cy={24} r={10} fill={paint} opacity={0.9} />
          <Path d="M24 2 L28 10 H20 Z" fill={paint} opacity={0.8} />
          <Path d="M24 46 L28 38 H20 Z" fill={paint} opacity={0.8} />
          <Path d="M2 24 L10 20 V28 Z" fill={paint} opacity={0.8} />
          <Path d="M46 24 L38 20 V28 Z" fill={paint} opacity={0.8} />
          <Path d="M8 8 L16 12 L12 16 Z" fill={paint} opacity={0.6} />
          <Path d="M40 40 L32 36 L36 32 Z" fill={paint} opacity={0.6} />
          <Path d="M8 40 L12 32 L16 36 Z" fill={paint} opacity={0.6} />
          <Path d="M40 8 L36 16 L32 12 Z" fill={paint} opacity={0.6} />
          <Circle cx={24} cy={24} r={5} fill="#FFFFFF" opacity={0.4} />
        </>
      ) : null}

      {name === 'atlas' ? (
        <>
          <Gradient id={gradientId} from="#38BDF8" to="#0284C7" />
          <Circle cx={24} cy={24} r={18} stroke={paint} strokeWidth={3} fill="none" opacity={0.3} />
          <Ellipse
            cx={24}
            cy={24}
            rx={18}
            ry={6}
            stroke={paint}
            strokeWidth={2}
            fill="none"
            opacity={0.6}
          />
          <Ellipse
            cx={24}
            cy={24}
            rx={6}
            ry={18}
            stroke={paint}
            strokeWidth={2}
            fill="none"
            opacity={0.6}
          />
          <Circle cx={24} cy={12} r={2} fill="#FFFFFF" />
          <Circle cx={24} cy={36} r={2} fill="#FFFFFF" />
        </>
      ) : null}

      {name === 'chronos' ? (
        <>
          <Gradient id={gradientId} from="#FDE047" to="#CA8A04" />
          <Circle cx={24} cy={24} r={18} stroke={paint} strokeWidth={3} fill="none" opacity={0.3} />
          <Path d="M24 24 L24 6 A 18 18 0 0 1 38 32 Z" fill={paint} opacity={0.6} />
          <Path
            d="M24 24 L14 24"
            stroke={paint}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.9}
          />
          <Circle cx={24} cy={24} r={3} fill="#FFFFFF" />
        </>
      ) : null}

      {name === 'statue' ? (
        <>
          <Gradient id={gradientId} from="#94A3B8" to="#475569" />
          <Path d="M12 36 L24 30 L36 36 L24 42 Z" fill={paint} opacity={0.8} />
          <Path d="M12 36 V42 L24 48 V42 Z" fill={paint} opacity={0.9} />
          <Path d="M24 42 L36 36 V42 L24 48 Z" fill={paint} opacity={0.6} />
          <Path d="M18 30 L24 20 L30 30 Z" fill={paint} opacity={0.4} />
          <Path d="M24 8 L30 16 L24 24 L18 16 Z" fill={paint} opacity={0.9} />
          <Path d="M24 8 L24 24 L18 16 Z" fill="#FFFFFF" opacity={0.3} />
        </>
      ) : null}

      {name === 'portal' ? (
        <>
          <Gradient id={gradientId} from="#818CF8" to="#3730A3" />
          <Path d="M6 38 L24 30 L42 38 L24 46 Z" fill={paint} opacity={0.3} />
          <Path
            d="M14 34 V14 L24 8 L34 14 V34"
            stroke={paint}
            strokeWidth={4}
            fill="none"
            opacity={0.6}
          />
          <Path d="M18 32 V16 L24 12 L30 16 V32 Z" fill={paint} opacity={0.9} />
        </>
      ) : null}

      {name === 'resonance' ? (
        <>
          <Gradient id={gradientId} from="#C084FC" to="#7E22CE" />
          <Rect x={10} y={16} width={4} height={16} rx={2} fill={paint} opacity={0.4} />
          <Rect x={18} y={10} width={4} height={28} rx={2} fill={paint} opacity={0.7} />
          <Rect x={26} y={6} width={4} height={36} rx={2} fill={paint} opacity={0.9} />
          <Rect x={34} y={14} width={4} height={20} rx={2} fill={paint} opacity={0.5} />
          <Path
            d="M6 24 Q 18 12, 26 24 T 42 24"
            stroke="#FFFFFF"
            strokeWidth={2}
            fill="none"
            opacity={0.8}
          />
        </>
      ) : null}

      {name === 'luna' ? (
        <>
          <Gradient id={gradientId} from="#A78BFA" to="#4F46E5" />
          <Path
            d="M30 10 C20 10, 12 18, 12 28 C12 38, 20 46, 30 46 C22 40, 20 30, 26 22 C29 18, 34 16, 38 16 C36 12, 33 10, 30 10 Z"
            fill={paint}
            opacity={0.9}
          />
          <Circle cx={22} cy={28} r={6} fill={paint} opacity={0.3} />
          <Circle cx={22} cy={28} r={3} fill="#FFFFFF" opacity={0.5} />
          <Path d="M14 14 L16 16 L14 18 L12 16 Z" fill="#FFFFFF" opacity={0.8} />
          <Path d="M36 34 L38 36 L36 38 L34 36 Z" fill="#FFFFFF" opacity={0.6} />
        </>
      ) : null}

      {name === 'cortex' ? (
        <>
          <Gradient id={gradientId} from="#60A5FA" to="#2563EB" />
          <Circle cx={24} cy={24} r={6} fill={paint} opacity={0.9} />
          <Line x1={24} y1={24} x2={12} y2={12} stroke={paint} strokeWidth={2} opacity={0.5} />
          <Line x1={24} y1={24} x2={36} y2={12} stroke={paint} strokeWidth={2} opacity={0.5} />
          <Line x1={24} y1={24} x2={12} y2={36} stroke={paint} strokeWidth={2} opacity={0.5} />
          <Line x1={24} y1={24} x2={36} y2={36} stroke={paint} strokeWidth={2} opacity={0.5} />
          <Circle cx={12} cy={12} r={4} fill={paint} opacity={0.6} />
          <Circle cx={36} cy={12} r={3} fill={paint} opacity={0.4} />
          <Circle cx={12} cy={36} r={3} fill={paint} opacity={0.4} />
          <Circle cx={36} cy={36} r={4} fill={paint} opacity={0.6} />
        </>
      ) : null}

      {name === 'terminal' ? (
        <>
          <Gradient id={gradientId} from="#94A3B8" to="#475569" />
          <Rect
            x={6}
            y={10}
            width={36}
            height={28}
            rx={4}
            stroke={paint}
            strokeWidth={3}
            fill="none"
            opacity={0.3}
          />
          <Path
            d="M12 18 L18 24 L12 30"
            stroke={paint}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.9}
          />
          <Rect x={22} y={28} width={8} height={3} fill={paint} opacity={0.8} />
        </>
      ) : null}
    </Svg>
  );
});
