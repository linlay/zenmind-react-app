import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { TerminalSessionItem } from '../types/terminal';

interface TerminalSessionListPaneProps {
  theme: AppTheme;
  loading: boolean;
  error: string;
  sessions: TerminalSessionItem[];
  activeSessionId: string;
  currentWebViewUrl?: string;
  onCreateSession: () => void;
  onRefresh: () => void;
  onSelectSession: (sessionId: string) => void;
}

export function TerminalSessionListPane({
  theme,
  loading,
  error,
  sessions,
  activeSessionId,
  currentWebViewUrl = '',
  onCreateSession,
  onRefresh,
  onSelectSession
}: TerminalSessionListPaneProps) {
  const normalizedCurrentWebViewUrl = String(currentWebViewUrl || '').trim();
  const hasCurrentWebViewUrl = Boolean(normalizedCurrentWebViewUrl);

  const handleCopyCurrentUrl = async () => {
    if (!hasCurrentWebViewUrl) {
      return;
    }
    await Clipboard.setStringAsync(normalizedCurrentWebViewUrl);
    Alert.alert('已复制', '当前终端地址已复制到剪贴板');
  };

  return (
    <View style={styles.container} testID="terminal-session-list-pane">
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]}>会话</Text>
        <TouchableOpacity
          activeOpacity={0.76}
          style={styles.refreshBtn}
          testID="terminal-sessions-refresh-btn"
          onPress={onRefresh}
        >
          {loading ? <ActivityIndicator size="small" color={theme.primaryDeep} /> : <Text style={[styles.refreshText, { color: theme.primaryDeep }]}>↻</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          activeOpacity={0.74}
          style={[styles.actionBtn, { backgroundColor: theme.surfaceStrong }]}
          testID="terminal-sessions-create-btn"
          onPress={onCreateSession}
        >
          <Text style={[styles.actionText, { color: theme.textSoft }]}>+ 新会话</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.listWrap} contentContainerStyle={styles.listContent}>
        {sessions.length ? (
          sessions.map((session, index) => {
            const active = session.sessionId === activeSessionId;
            const title = session.title || session.sessionId;
            const parts: string[] = [];
            if (session.sessionType) parts.push(session.sessionType);
            if (session.toolId) parts.push(session.toolId);
            parts.push(session.sessionId);
            const meta = parts.join(' · ');
            return (
              <TouchableOpacity
                key={session.sessionId}
                activeOpacity={0.74}
                testID={`terminal-session-item-${index}`}
                style={[styles.item, { backgroundColor: active ? theme.primarySoft : theme.surfaceStrong }]}
                onPress={() => onSelectSession(session.sessionId)}
              >
                <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={[styles.itemMeta, { color: theme.textMute }]} numberOfLines={1}>
                  {meta}
                </Text>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: theme.surfaceStrong, marginTop: 8 }]}>
            <Text style={[styles.emptyText, { color: theme.textMute }]}>{loading ? '加载中...' : error || '暂无终端会话'}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.currentUrlCard, { backgroundColor: theme.surfaceStrong }]} testID="terminal-current-url-footer">
        <View style={styles.currentUrlHead}>
          <Text style={[styles.currentUrlLabel, { color: theme.textSoft }]}>当前地址</Text>
          <TouchableOpacity
            activeOpacity={0.74}
            style={[
              styles.currentUrlCopyBtn,
              {
                backgroundColor: hasCurrentWebViewUrl ? theme.surface : theme.surfaceStrong,
                borderColor: hasCurrentWebViewUrl ? theme.primaryDeep : theme.textMute
              }
            ]}
            testID="terminal-current-url-copy-btn"
            onPress={handleCopyCurrentUrl}
            disabled={!hasCurrentWebViewUrl}
          >
            <Text style={[styles.currentUrlCopyText, { color: hasCurrentWebViewUrl ? theme.primaryDeep : theme.textMute }]}>复制</Text>
          </TouchableOpacity>
        </View>
        <Text
          style={[styles.currentUrlText, { color: hasCurrentWebViewUrl ? theme.text : theme.textMute }]}
          numberOfLines={1}
          ellipsizeMode="middle"
          testID="terminal-current-url-text"
        >
          {hasCurrentWebViewUrl ? normalizedCurrentWebViewUrl : '未进入终端页面'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 8
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    fontSize: 23,
    fontWeight: '700'
  },
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  refreshText: {
    fontSize: 14,
    fontWeight: '600'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 10
  },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center'
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600'
  },
  listWrap: {
    flex: 1
  },
  listContent: {
    paddingBottom: 12,
    gap: 8
  },
  currentUrlCard: {
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 10
  },
  currentUrlHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  currentUrlLabel: {
    fontSize: 12,
    fontWeight: '600'
  },
  currentUrlCopyBtn: {
    minHeight: 28,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth
  },
  currentUrlCopyText: {
    fontSize: 12,
    fontWeight: '700'
  },
  currentUrlText: {
    marginTop: 7,
    fontSize: 12
  },
  item: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600'
  },
  itemMeta: {
    marginTop: 4,
    fontSize: 11
  },
  emptyCard: {
    borderRadius: 10,
    paddingVertical: 22,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 12
  }
});
