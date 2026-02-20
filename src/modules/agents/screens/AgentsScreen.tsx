import { StyleSheet, Text, View } from 'react-native';
import { AgentsWebViewPlaceholder } from '../components/AgentsWebViewPlaceholder';

interface AgentsScreenProps {
  theme: {
    surfaceStrong: string;
    surface: string;
    text: string;
    textSoft: string;
    primary: string;
    primaryDeep: string;
    primarySoft: string;
  };
}

export function AgentsScreen({ theme }: AgentsScreenProps) {
  return (
    <View style={styles.container} nativeID="agents-root" testID="agents-root">
      <View style={[styles.card, { backgroundColor: theme.surfaceStrong }]} nativeID="agents-card" testID="agents-card">
        <Text style={[styles.title, { color: theme.text }]}>智能体管理</Text>
        <Text style={[styles.hint, { color: theme.textSoft }]}>智能体列表与切换已迁移到侧边栏。</Text>
      </View>

      <AgentsWebViewPlaceholder />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 10
  },
  card: {
    borderRadius: 12,
    padding: 12,
    gap: 10
  },
  title: {
    fontSize: 15,
    fontWeight: '700'
  },
  hint: {
    fontSize: 12,
    lineHeight: 18
  }
});
