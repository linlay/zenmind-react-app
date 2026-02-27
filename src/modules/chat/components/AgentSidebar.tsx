import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { Agent } from '../../../core/types/common';
import { getAgentKey, getAgentName } from '../../../shared/utils/format';

interface AgentSidebarProps {
  visible: boolean;
  theme: AppTheme;
  agents: Agent[];
  selectedAgentKey: string;
  onClose: () => void;
  onSelectAgent: (agentKey: string) => void;
}

const SIDEBAR_WIDTH = 284;

export function AgentSidebar({
  visible,
  theme,
  agents,
  selectedAgentKey,
  onClose,
  onSelectAgent
}: AgentSidebarProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 210 : 180,
      useNativeDriver: true
    }).start();
  }, [anim, visible]);

  const translateX = useMemo(
    () =>
      anim.interpolate({
        inputRange: [0, 1],
        outputRange: [-SIDEBAR_WIDTH, 0]
      }),
    [anim]
  );

  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.layer]} testID="chat-agent-sidebar-layer">
      <Animated.View style={[styles.overlay, { opacity: anim, backgroundColor: theme.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            width: SIDEBAR_WIDTH,
            transform: [{ translateX }],
            backgroundColor: theme.surface,
            borderColor: theme.border
          }
        ]}
        testID="chat-agent-sidebar"
      >
        <View style={[styles.head, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>智能体列表</Text>
          <TouchableOpacity
            activeOpacity={0.78}
            style={[styles.closeBtn, { backgroundColor: theme.surfaceStrong }]}
            onPress={onClose}
            testID="chat-agent-sidebar-close-btn"
          >
            <Text style={[styles.closeBtnText, { color: theme.textSoft }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {(agents.length ? agents : [{ key: '', name: '暂无 Agent' }]).map((agent, index) => {
            const key = getAgentKey(agent);
            const name = getAgentName(agent) || key || `Agent ${index + 1}`;
            const selected = key && key === selectedAgentKey;
            return (
              <TouchableOpacity
                key={key || `${name}-${index}`}
                disabled={!key}
                activeOpacity={0.78}
                testID={`chat-agent-sidebar-item-${index}`}
                style={[
                  styles.item,
                  {
                    backgroundColor: selected ? theme.primarySoft : theme.surfaceStrong,
                    borderColor: selected ? theme.primary : theme.border
                  }
                ]}
                onPress={() => {
                  if (!key) {
                    return;
                  }
                  onSelectAgent(key);
                }}
              >
                <Text style={[styles.itemTitle, { color: selected ? theme.primaryDeep : theme.text }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.itemSub, { color: theme.textMute }]} numberOfLines={1}>
                  {key || '未配置 key'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: 24,
    elevation: 24
  },
  overlay: {
    ...StyleSheet.absoluteFillObject
  },
  panel: {
    height: '100%',
    borderRightWidth: StyleSheet.hairlineWidth
  },
  head: {
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12
  },
  title: {
    fontSize: 17,
    fontWeight: '700'
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '600'
  },
  list: {
    flex: 1
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8
  },
  item: {
    borderRadius: 12,
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600'
  },
  itemSub: {
    marginTop: 2,
    fontSize: 11
  }
});
