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
}

const ITEMS: Array<{ key: DomainMode; label: string }> = [
  { key: 'chat', label: '聊天助理' },
  { key: 'terminal', label: '终端管理' },
  { key: 'agents', label: '智能体管理' },
  { key: 'user', label: '用户配置' }
];

export function DomainSwitcher({ value, onChange, theme }: DomainSwitcherProps) {
  return (
    <View style={styles.wrap}>
      {ITEMS.map((item) => {
        const active = item.key === value;
        return (
          <TouchableOpacity
            key={item.key}
            activeOpacity={0.8}
            style={[
              styles.btn,
              {
                backgroundColor: active ? theme.primarySoft : theme.surfaceStrong,
                borderColor: active ? theme.primary : theme.border
              }
            ]}
            onPress={() => onChange(item.key)}
          >
            <Text style={{ color: active ? theme.primaryDeep : theme.textSoft, fontSize: 12, fontWeight: '600' }}>
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
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  btn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10
  }
});
