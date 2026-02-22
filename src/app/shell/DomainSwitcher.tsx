import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
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
        <Path d="M5 6.5C5 5.1 6.1 4 7.5 4h9C17.9 4 19 5.1 19 6.5v6c0 1.4-1.1 2.5-2.5 2.5H10l-3.5 3v-3H7.5C6.1 15 5 13.9 5 12.5v-6Z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
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
      <Path d="M12 6.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM5 20.2a7 7 0 0 1 14 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
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
