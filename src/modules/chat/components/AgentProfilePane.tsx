import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { Agent } from '../../../core/types/common';
import { getAgentIconColor, getAgentIconName, getAgentKey, getAgentName } from '../../../shared/utils/format';
import { AgentAvatarIcon, resolveAgentAvatarBgColor, resolveAgentAvatarName } from './agentAvatarRegistry';

interface AgentProfilePaneProps {
  theme: AppTheme;
  agent: Agent | null | undefined;
  onStartChat: (agentKey: string) => void;
}

function toTextList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => String(item || '').trim())
    .filter((item) => Boolean(item));
}

export function AgentProfilePane({ theme, agent, onStartChat }: AgentProfilePaneProps) {
  const key = getAgentKey(agent);
  const name = getAgentName(agent) || key || '未知智能体';
  const description = String((agent as Record<string, unknown> | null | undefined)?.description || '').trim();
  const meta = ((agent as Record<string, unknown> | null | undefined)?.meta || {}) as Record<string, unknown>;
  const model = String(meta.model || '').trim();
  const mode = String(meta.mode || '').trim();
  const tools = toTextList(meta.tools);
  const skills = toTextList(meta.skills);
  const avatarName = resolveAgentAvatarName(key, getAgentIconName(agent));
  const avatarColor = resolveAgentAvatarBgColor(key, getAgentIconColor(agent));

  if (!agent || !key) {
    return (
      <View style={styles.container} testID="chat-agent-profile-pane">
        <View style={[styles.emptyCard, { backgroundColor: theme.surfaceStrong }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>智能体信息不可用</Text>
          <Text style={[styles.emptySub, { color: theme.textMute }]}>请返回列表后重新选择智能体。</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="chat-agent-profile-pane">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={[styles.heroCard, { backgroundColor: theme.surfaceStrong }]}>
          <View style={[styles.avatarWrap, { backgroundColor: avatarColor }]}>
            <AgentAvatarIcon name={avatarName} size={28} color="#ffffff" />
          </View>
          <Text style={[styles.agentName, { color: theme.text }]}>{name}</Text>
          <Text style={[styles.agentKey, { color: theme.textMute }]}>{key}</Text>
          <Text style={[styles.agentDescription, { color: theme.textSoft }]}>{description || '暂无描述'}</Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surfaceStrong }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>运行信息</Text>
          <Text style={[styles.sectionRow, { color: theme.textSoft }]}>{`模型：${model || '-'}`}</Text>
          <Text style={[styles.sectionRow, { color: theme.textSoft }]}>{`模式：${mode || '-'}`}</Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surfaceStrong }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>工具</Text>
          <Text style={[styles.sectionRow, { color: theme.textSoft }]} numberOfLines={4}>
            {tools.length ? tools.join('、') : '无'}
          </Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surfaceStrong }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Skills</Text>
          <Text style={[styles.sectionRow, { color: theme.textSoft }]} numberOfLines={4}>
            {skills.length ? skills.join('、') : '无'}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface }]}>
        <TouchableOpacity
          activeOpacity={0.82}
          testID="chat-agent-profile-start-chat-btn"
          style={[styles.startChatBtn, { backgroundColor: theme.primary }]}
          onPress={() => onStartChat(key)}
        >
          <Text style={styles.startChatBtnText}>发起对话</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 10
  },
  scroll: {
    flex: 1
  },
  content: {
    paddingBottom: 20,
    gap: 10
  },
  heroCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center'
  },
  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center'
  },
  agentName: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '700'
  },
  agentKey: {
    marginTop: 4,
    fontSize: 12
  },
  agentDescription: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center'
  },
  sectionCard: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700'
  },
  sectionRow: {
    fontSize: 13,
    lineHeight: 19
  },
  footer: {
    paddingTop: 10,
    paddingBottom: 12
  },
  startChatBtn: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  startChatBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  emptyCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 18
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700'
  },
  emptySub: {
    marginTop: 6,
    fontSize: 13
  }
});
