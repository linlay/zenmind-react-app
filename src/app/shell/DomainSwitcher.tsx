import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { DomainMode } from '../../core/types/common';

interface DomainSwitcherProps {
  value: DomainMode;
  onChange: (mode: DomainMode) => void;
  theme: {
    primarySoft: string;
    primary: string;
    textSoft: string;
    primaryDeep: string;
    surfaceStrong: string;
    border: string;
  };
  compact?: boolean;
}

const ITEMS: Array<{ key: DomainMode; label: string }> = [
  { key: 'chat', label: '助理' },
  { key: 'terminal', label: '终端' },
  { key: 'agents', label: '智能体' },
  { key: 'user', label: '配置' }
];

const COMPACT_ICON_SIZE = 20;

function DomainIcon({ mode, color }: { mode: DomainMode; color: string }) {
  if (mode === 'chat') {
    return (
      <Svg width={COMPACT_ICON_SIZE} height={COMPACT_ICON_SIZE} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 5.8c4.7 0 8.4 2.8 8.4 6.3s-3.7 6.3-8.4 6.3c-1.2 0-2.3-.2-3.3-.6L5.4 19.6l1.4-3c-1.4-1.1-2.2-2.7-2.2-4.5c0-3.5 3.7-6.3 8.4-6.3Z"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (mode === 'terminal') {
    return (
      <Svg width={COMPACT_ICON_SIZE} height={COMPACT_ICON_SIZE} viewBox="0 0 24 24" fill="none">
        <Rect x={3.5} y={5} width={17} height={14} rx={2.4} stroke={color} strokeWidth={1.8} />
        <Path d="M8 10l2.8 2.4L8 14.8M13.2 15h3.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }

  if (mode === 'agents') {
    return (
      <Svg width={COMPACT_ICON_SIZE} height={COMPACT_ICON_SIZE} viewBox="0 0 24 24" fill="none">
        <Rect x={4.5} y={7} width={15} height={11} rx={2.2} stroke={color} strokeWidth={1.8} />
        <Path d="M9 4.8h6M12 7V4.8M9.2 11.4h.01M14.8 11.4h.01" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={COMPACT_ICON_SIZE} height={COMPACT_ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.8 8.2H19.2M4.8 12H19.2M4.8 15.8H19.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx={9} cy={8.2} r={1.8} fill={color} />
      <Circle cx={14.8} cy={12} r={1.8} fill={color} />
      <Circle cx={7.2} cy={15.8} r={1.8} fill={color} />
    </Svg>
  );
}

export function DomainSwitcher({ value, onChange, theme, compact }: DomainSwitcherProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]} nativeID="domain-switcher" testID="domain-switcher">
      {ITEMS.map((item) => {
        const active = item.key === value;
        const textColor = active ? theme.primaryDeep : theme.textSoft;
        return (
          <TouchableOpacity
            key={item.key}
            activeOpacity={0.8}
            testID={`domain-switch-${item.key}`}
            style={[
              styles.btn,
              compact && styles.btnCompact,
              {
                backgroundColor: active ? theme.primarySoft : theme.surfaceStrong,
                borderColor: active ? theme.primary : theme.border
              }
            ]}
            onPress={() => onChange(item.key)}
          >
            {compact ? (
              <DomainIcon mode={item.key} color={textColor} />
            ) : (
              <Text style={{ color: textColor, fontSize: 12, fontWeight: '600' }}>{item.label}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 8
  },
  wrapCompact: {
    gap: 4,
    flexShrink: 0,
    alignSelf: 'flex-end'
  },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  btnCompact: {
    flex: 0,
    width: 36,
    minHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 0
  }
});
