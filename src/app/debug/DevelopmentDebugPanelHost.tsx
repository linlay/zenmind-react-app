import { useEffect, useState } from 'react';
import {
  DevSettings,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getApiBaseUrl } from '../../core/api/apiClient';
import { chatSyncService } from '../../features/chatRealtime/chatSyncService';
import { wsDebugRecorder, type WsDebugRecord } from '../../features/chatRealtime/wsDebugRecorder';
import {
  closeDevelopmentDebugPanel,
  disableDevelopmentDebugPanel,
  getDevelopmentDebugPanelSnapshot,
  openDevelopmentDebugPanel,
  subscribeDevelopmentDebugPanel,
} from './developmentDebugPanel';

type WsDebugSnapshot = ReturnType<typeof wsDebugRecorder.getSnapshot>;

type DevelopmentDebugPanelHostProps = {
  isChatDetailRoute?: boolean;
};

const EMPTY_WS_DEBUG_SNAPSHOT: WsDebugSnapshot = {
  enabled: false,
  mirrorToConsole: false,
  records: [],
};
const DEFAULT_FLOATING_BUTTON_BOTTOM = 96;
const CHAT_DETAIL_FLOATING_BUTTON_BOTTOM = 176;
const DEFAULT_FLOATING_BUTTON_SAFE_GAP = 72;
const CHAT_DETAIL_FLOATING_BUTTON_SAFE_GAP = 152;

function padTimePart(value: number) {
  return String(value).padStart(2, '0');
}

function formatFrameTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:${padTimePart(
    date.getSeconds()
  )}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function formatFrameLabel(record: WsDebugRecord) {
  const frame = record.frame || '-';
  const type = record.type || '-';
  return `${record.direction} / ${frame} / ${type}`;
}

export function DevelopmentDebugPanelHost({
  isChatDetailRoute = false,
}: DevelopmentDebugPanelHostProps) {
  const insets = useSafeAreaInsets();
  const [panelSnapshot, setPanelSnapshot] = useState(() => getDevelopmentDebugPanelSnapshot());
  const [wsSnapshot, setWsSnapshot] = useState<WsDebugSnapshot>(EMPTY_WS_DEBUG_SNAPSHOT);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [isResettingCache, setIsResettingCache] = useState(false);
  const [cacheResetErrorText, setCacheResetErrorText] = useState('');
  const { enabled, visible } = panelSnapshot;

  useEffect(() => {
    return subscribeDevelopmentDebugPanel((nextSnapshot) => {
      setPanelSnapshot(nextSnapshot);
    });
  }, []);

  useEffect(() => {
    if (!visible) {
      setWsSnapshot(EMPTY_WS_DEBUG_SNAPSHOT);
      return;
    }

    return wsDebugRecorder.subscribe((nextSnapshot) => {
      setWsSnapshot(nextSnapshot);
      setSelectedRecordId((currentRecordId) => {
        if (!currentRecordId) {
          return null;
        }

        return nextSnapshot.records.some((record) => record.id === currentRecordId)
          ? currentRecordId
          : null;
      });
    });
  }, [visible]);

  if (!enabled && !visible) {
    return null;
  }

  if (!visible) {
    const floatingButtonBottom = Math.max(
      isChatDetailRoute ? CHAT_DETAIL_FLOATING_BUTTON_BOTTOM : DEFAULT_FLOATING_BUTTON_BOTTOM,
      insets.bottom +
        (isChatDetailRoute
          ? CHAT_DETAIL_FLOATING_BUTTON_SAFE_GAP
          : DEFAULT_FLOATING_BUTTON_SAFE_GAP)
    );

    return (
      <View
        pointerEvents="box-none"
        style={[styles.floatingLayer, { bottom: floatingButtonBottom }]}
      >
        <Pressable style={styles.floatingButton} onPress={openDevelopmentDebugPanel}>
          <Text style={styles.floatingButtonText}>Debug</Text>
        </Pressable>
      </View>
    );
  }

  const platformLabel =
    Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web';
  const apiBaseUrl = getApiBaseUrl() || '(not configured)';
  const wsRecords = [...wsSnapshot.records].reverse();
  const selectedRecord =
    (selectedRecordId
      ? wsSnapshot.records.find((record) => record.id === selectedRecordId)
      : null) ||
    wsRecords[0] ||
    null;
  const primaryHint =
    Platform.OS === 'android'
      ? '系统 Dev Menu 可通过摇一摇或 Cmd/Ctrl + M 打开。'
      : Platform.OS === 'ios'
        ? '系统 Dev Menu 可通过摇一摇打开。'
        : 'Web 端没有摇一摇；可在启动终端按 j 打开 DevTools。';
  const secondaryHint =
    Platform.OS === 'web'
      ? '底部的 “Open debugger to view warnings” 是开发态提示，不是页面报错。'
      : '底部的 “Open debugger to view warnings” 是开发态提示，详细 warning 需要在 DevTools 里看。';

  const reloadDevelopmentRuntime = () => {
    if (Platform.OS === 'web') {
      closeDevelopmentDebugPanel();
      return false;
    }

    DevSettings.reload();
    return true;
  };

  const handleReload = () => {
    reloadDevelopmentRuntime();
  };

  const handleFullClose = () => {
    wsDebugRecorder.setEnabled(false);
    wsDebugRecorder.setMirrorToConsole(false);
    wsDebugRecorder.clear();
    setSelectedRecordId(null);
    setCacheResetErrorText('');
    disableDevelopmentDebugPanel();
  };

  const handleResetLocalCache = async () => {
    if (isResettingCache) {
      return;
    }

    setCacheResetErrorText('');
    setIsResettingCache(true);
    try {
      wsDebugRecorder.clear();
      setSelectedRecordId(null);
      await chatSyncService.resetLocalCacheForDevelopment();
      if (!reloadDevelopmentRuntime()) {
        setIsResettingCache(false);
      }
    } catch (error) {
      setCacheResetErrorText(error instanceof Error ? error.message : String(error));
      setIsResettingCache(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeDevelopmentDebugPanel}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPressArea} onPress={closeDevelopmentDebugPanel} />
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>开发调试</Text>
          <Text style={styles.panelMeta}>当前平台：{platformLabel}</Text>
          <Text style={styles.panelMeta}>API Base URL：{apiBaseUrl}</Text>

          <ScrollView style={styles.hintList} contentContainerStyle={styles.hintListContent}>
            <Text style={styles.hintText}>{primaryHint}</Text>
            <Text style={styles.hintText}>{secondaryHint}</Text>
            <Text style={styles.hintText}>
              如果你是通过 `expo start` 启动，终端里按 `j` 可以直接打开电脑上的 DevTools。
            </Text>
            <View style={styles.debugSection}>
              <View style={styles.debugSectionHeader}>
                <Text style={styles.debugSectionTitle}>Local Cache</Text>
                <Text style={styles.debugSectionMeta}>SQLite + MMKV</Text>
              </View>

              <Pressable
                disabled={isResettingCache}
                style={[
                  styles.cacheResetButton,
                  isResettingCache ? styles.debugDisabledButton : null,
                ]}
                onPress={handleResetLocalCache}
              >
                <Text style={styles.cacheResetButtonText}>
                  {isResettingCache
                    ? '清理中...'
                    : Platform.OS === 'web'
                      ? '清理聊天缓存'
                      : '清理缓存并重载'}
                </Text>
              </Pressable>

              {cacheResetErrorText ? (
                <Text style={styles.debugErrorText}>清理失败：{cacheResetErrorText}</Text>
              ) : null}
            </View>
            <View style={styles.debugSection}>
              <View style={styles.debugSectionHeader}>
                <Text style={styles.debugSectionTitle}>WS Frames</Text>
                <Text style={styles.debugSectionMeta}>
                  {wsSnapshot.enabled ? '捕获中' : '已停止'} · {wsSnapshot.records.length}/200
                </Text>
              </View>

              <View style={styles.debugControls}>
                <Pressable
                  style={[
                    styles.debugControlButton,
                    wsSnapshot.enabled ? styles.debugStopButton : styles.debugStartButton,
                  ]}
                  onPress={() => wsDebugRecorder.setEnabled(!wsSnapshot.enabled)}
                >
                  <Text
                    style={[
                      styles.debugControlText,
                      wsSnapshot.enabled ? styles.debugStopText : styles.debugStartText,
                    ]}
                  >
                    {wsSnapshot.enabled ? '停止捕获' : '开始捕获'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.debugControlButton,
                    wsSnapshot.mirrorToConsole
                      ? styles.debugStartButton
                      : styles.debugNeutralButton,
                  ]}
                  onPress={() => wsDebugRecorder.setMirrorToConsole(!wsSnapshot.mirrorToConsole)}
                >
                  <Text
                    style={[
                      styles.debugControlText,
                      wsSnapshot.mirrorToConsole ? styles.debugStartText : styles.debugNeutralText,
                    ]}
                  >
                    Console
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.debugControlButton, styles.debugNeutralButton]}
                  onPress={() => {
                    wsDebugRecorder.clear();
                    setSelectedRecordId(null);
                  }}
                >
                  <Text style={[styles.debugControlText, styles.debugNeutralText]}>清空</Text>
                </Pressable>
              </View>

              {wsRecords.length <= 0 ? (
                <Text style={styles.debugEmptyText}>
                  暂无 frame。开启捕获后发送消息、等待 push 或触发重连即可看到数据。
                </Text>
              ) : (
                <View style={styles.frameList}>
                  {wsRecords.map((record) => {
                    const selected = selectedRecord?.id === record.id;
                    return (
                      <Pressable
                        key={record.id}
                        style={[styles.frameRow, selected ? styles.frameRowSelected : null]}
                        onPress={() => setSelectedRecordId(record.id)}
                      >
                        <Text style={styles.frameRowTitle} numberOfLines={1}>
                          {formatFrameTime(record.timestamp)} · {formatFrameLabel(record)}
                        </Text>
                        <Text style={styles.frameRowMeta} numberOfLines={1}>
                          {record.requestId ? `${record.requestId} · ` : ''}
                          {record.payloadBytes} bytes{record.truncated ? ' · truncated' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={styles.frameJsonBox}>
                <ScrollView nestedScrollEnabled>
                  <Text selectable style={styles.frameJsonText}>
                    {selectedRecord ? selectedRecord.json : 'No selected WS frame.'}
                  </Text>
                </ScrollView>
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={closeDevelopmentDebugPanel}
            >
              <Text style={styles.secondaryButtonText}>关闭</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.dangerButton]} onPress={handleFullClose}>
              <Text style={styles.dangerButtonText}>彻底关闭</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.primaryButton]} onPress={handleReload}>
              <Text style={styles.primaryButtonText}>
                {Platform.OS === 'web' ? '知道了' : '重新加载'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  floatingLayer: {
    position: 'absolute',
    right: 16,
  },
  floatingButton: {
    minWidth: 72,
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  floatingButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.28)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  backdropPressArea: {
    flex: 1,
  },
  panel: {
    maxHeight: '78%',
    borderRadius: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
  },
  panelTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  panelMeta: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
  },
  hintList: {
    marginTop: 16,
  },
  hintListContent: {
    gap: 12,
  },
  hintText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },
  debugSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d1d5db',
    paddingTop: 16,
    gap: 12,
  },
  debugSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  debugSectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  debugSectionMeta: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
  },
  debugControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  debugControlButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  debugStartButton: {
    backgroundColor: '#dbeafe',
  },
  debugStopButton: {
    backgroundColor: '#fee2e2',
  },
  debugNeutralButton: {
    backgroundColor: '#f3f4f6',
  },
  debugDisabledButton: {
    opacity: 0.55,
  },
  debugControlText: {
    fontSize: 13,
    fontWeight: '700',
  },
  debugStartText: {
    color: '#1d4ed8',
  },
  debugStopText: {
    color: '#b91c1c',
  },
  debugNeutralText: {
    color: '#374151',
  },
  debugEmptyText: {
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 18,
  },
  debugErrorText: {
    color: '#b91c1c',
    fontSize: 13,
    lineHeight: 18,
  },
  cacheResetButton: {
    borderRadius: 10,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cacheResetButtonText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '700',
  },
  frameList: {
    gap: 6,
  },
  frameRow: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  frameRowSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  frameRowTitle: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
  frameRowMeta: {
    marginTop: 3,
    color: '#6b7280',
    fontSize: 11,
  },
  frameJsonBox: {
    minHeight: 140,
    maxHeight: 260,
    borderRadius: 10,
    backgroundColor: '#111827',
    padding: 12,
  },
  frameJsonText: {
    color: '#e5e7eb',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#fee2e2',
  },
  dangerButtonText: {
    color: '#b91c1c',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#111827',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
