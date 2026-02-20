import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

export function DomainSwitcher({ value, onChange, theme, compact }: DomainSwitcherProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]} nativeID="domain-switcher" testID="domain-switcher">
      {ITEMS.map((item) => {
        const active = item.key === value;
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
            <Text style={{ color: active ? theme.primaryDeep : theme.textSoft, fontSize: compact ? 11 : 12, fontWeight: '600' }}>
              {item.label}
            </Text>
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
    gap: 6,
    flex: 1
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
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 6
  }
});
