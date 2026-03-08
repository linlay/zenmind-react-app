import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AppTheme } from '../../../core/constants/theme';
import { Agent } from '../../../core/types/common';
import {
  getAgentIconColor,
  getAgentIconName,
  getAgentKey,
  getAgentName,
  getAgentRole
} from '../../../shared/utils/format';
import { AgentAvatarIcon, resolveAgentAvatarBgColor, resolveAgentAvatarName } from './agentAvatarRegistry';

interface TeamMentionPanelProps {
  theme: AppTheme;
  items: Agent[];
  onSelect: (agentKey: string) => void;
}

export function TeamMentionPanel({ theme, items, onSelect }: TeamMentionPanelProps) {
  if (!items.length) {
    return null;
  }

  return (
    <View
      style={[styles.panel, { backgroundColor: theme.surfaceStrong, borderColor: theme.border, shadowColor: theme.shadow }]}
      testID="team-mention-panel"
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {items.map((agent, index) => {
          const agentKey = getAgentKey(agent);
          const agentName = getAgentName(agent) || agentKey;
          const agentRole = getAgentRole(agent);
          const iconName = resolveAgentAvatarName(agentKey, getAgentIconName(agent));
          const iconBg = resolveAgentAvatarBgColor(agentKey, getAgentIconColor(agent));

          return (
            <TouchableOpacity
              key={agentKey || `${agentName}:${index}`}
              activeOpacity={0.78}
              style={[
                styles.item,
                index > 0 ? { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth } : null
              ]}
              onPress={() => {
                if (agentKey) {
                  onSelect(agentKey);
                }
              }}
              testID={`team-mention-item-${index}`}
            >
              <View style={[styles.avatarWrap, { backgroundColor: iconBg }]}>
                <AgentAvatarIcon name={iconName} size={18} color="#ffffff" />
              </View>
              <View style={styles.content}>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                  {agentName}
                </Text>
                {agentRole ? (
                  <Text style={[styles.subtitle, { color: theme.textMute }]} numberOfLines={1}>
                    {agentRole}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    maxHeight: 244,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  scroll: {
    maxHeight: 244
  },
  scrollContent: {
    paddingVertical: 2
  },
  item: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 12
  },
  title: {
    fontSize: 16,
    fontWeight: '700'
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '500'
  }
});
