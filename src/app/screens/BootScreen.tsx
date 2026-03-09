import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';

interface BootScreenProps {
  /** 加载提示信息 */
  message: string;
}

/**
 * 应用启动加载屏幕
 *
 * 用于以下场景：
 * 1. booting = true：正在加载配置
 * 2. authChecking = true：正在验证登录状态
 */
export function BootScreen({ message }: BootScreenProps) {
  const theme = useAppTheme();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: theme.surface }]}>
      <View style={styles.bootWrap}>
        <View style={[styles.bootCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.bootText, { color: theme.textSoft }]}>{message}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  bootWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bootCard: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  bootText: {
    fontSize: 14
  }
});
