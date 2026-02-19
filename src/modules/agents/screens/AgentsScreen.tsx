import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { getAgentKey, getAgentName } from '../../../shared/utils/format';
import { setSelectedAgentKey } from '../state/agentsSlice';
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
  const dispatch = useAppDispatch();
  const agents = useAppSelector((state) => state.agents.agents);
  const selectedAgentKey = useAppSelector((state) => state.agents.selectedAgentKey);

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: theme.surfaceStrong }]}> 
        <Text style={[styles.title, { color: theme.text }]}>智能体列表</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentRow}>
          {(agents.length ? agents : [{ key: '', name: '暂无 Agent' }]).map((agent, index) => {
            const key = getAgentKey(agent);
            const name = getAgentName(agent) || key || `Agent ${index + 1}`;
            const selected = key && key === selectedAgentKey;
            return (
              <TouchableOpacity
                key={key || `${name}-${index}`}
                disabled={!key}
                activeOpacity={0.78}
                style={[
                  styles.agentBtn,
                  {
                    backgroundColor: selected ? theme.primarySoft : theme.surface,
                    borderColor: selected ? theme.primary : 'transparent'
                  }
                ]}
                onPress={() => {
                  if (key) dispatch(setSelectedAgentKey(key));
                }}
              >
                <Text style={{ color: selected ? theme.primaryDeep : theme.textSoft, fontSize: 13, fontWeight: '600' }}>{name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
  agentRow: {
    gap: 8,
    paddingRight: 8
  },
  agentBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  }
});
