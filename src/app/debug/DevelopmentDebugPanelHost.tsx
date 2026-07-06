import { useEffect, useState } from 'react';
import {
  DevSettings,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getApiBaseUrl } from '../../core/api/apiClient';
import { chatSyncService } from '../../features/chatRealtime/chatSyncService';
import { httpDebugRecorder, type HttpDebugRecord } from '../../core/debug/httpDebugLogger';
import { wsDebugRecorder, type WsDebugRecord } from '../../core/debug/wsDebugRecorder';
import { cn } from '../../shared/visual/className';
import {
  closeDevelopmentDebugPanel,
  disableDevelopmentDebugPanel,
  getDevelopmentDebugPanelSnapshot,
  openDevelopmentDebugPanel,
  subscribeDevelopmentDebugPanel,
} from './developmentDebugPanel';

type WsDebugSnapshot = ReturnType<typeof wsDebugRecorder.getSnapshot>;
type HttpDebugSnapshot = ReturnType<typeof httpDebugRecorder.getSnapshot>;

type DevelopmentDebugPanelHostProps = {
  isChatDetailRoute?: boolean;
};

const EMPTY_WS_DEBUG_SNAPSHOT: WsDebugSnapshot = {
  enabled: false,
  mirrorToConsole: false,
  records: [],
};
const EMPTY_HTTP_DEBUG_SNAPSHOT: HttpDebugSnapshot = {
  enabled: false,
  records: [],
};
const DEFAULT_FLOATING_BUTTON_BOTTOM = 96;
const CHAT_DETAIL_FLOATING_BUTTON_BOTTOM = 176;
const DEFAULT_FLOATING_BUTTON_SAFE_GAP = 72;
const CHAT_DETAIL_FLOATING_BUTTON_SAFE_GAP = 152;
const FLOATING_LAYER_CLASS = 'absolute right-4';
const FLOATING_BUTTON_CLASS = 'min-w-[72px] items-center justify-center rounded-app-pill bg-gray-900 px-4 py-3';
const FLOATING_BUTTON_SHADOW_STYLE = {
  shadowColor: '#000000',
  shadowOffset: {
    width: 0,
    height: 8,
  },
  shadowOpacity: 0.18,
  shadowRadius: 16,
  elevation: 8,
} satisfies ViewStyle;
const FLOATING_BUTTON_TEXT_CLASS = 'text-[15px] font-bold text-white';
const BACKDROP_CLASS = 'flex-1 justify-end bg-[rgba(17,24,39,0.28)] p-4';
const BACKDROP_PRESS_AREA_CLASS = 'flex-1';
const PANEL_CLASS = 'max-h-[78%] rounded-[24px] bg-white px-5 pb-[18px] pt-5';
const PANEL_TITLE_CLASS = 'text-[22px] font-bold text-gray-900';
const PANEL_META_CLASS = 'mt-1.5 text-[13px] text-gray-500';
const HINT_LIST_CLASS = 'mt-4';
const HINT_LIST_CONTENT_CLASS = 'gap-3';
const HINT_TEXT_CLASS = 'text-[15px] leading-[22px] text-gray-700';
const DEBUG_SECTION_CLASS = 'gap-3 border-t border-gray-300 pt-4';
const DEBUG_SECTION_HEADER_CLASS = 'flex-row items-center justify-between gap-3';
const DEBUG_SECTION_TITLE_CLASS = 'text-[16px] font-bold text-gray-900';
const DEBUG_SECTION_META_CLASS = 'text-app-caption font-semibold text-gray-500';
const DEBUG_CONTROLS_CLASS = 'flex-row flex-wrap gap-2';
const DEBUG_CONTROL_BUTTON_CLASS = 'rounded-[10px] px-3 py-[9px]';
const DEBUG_START_BUTTON_CLASS = 'bg-blue-100';
const DEBUG_STOP_BUTTON_CLASS = 'bg-red-100';
const DEBUG_NEUTRAL_BUTTON_CLASS = 'bg-gray-100';
const DEBUG_DISABLED_BUTTON_CLASS = 'opacity-[0.55]';
const DEBUG_CONTROL_TEXT_CLASS = 'text-[13px] font-bold';
const DEBUG_START_TEXT_CLASS = 'text-blue-700';
const DEBUG_STOP_TEXT_CLASS = 'text-red-700';
const DEBUG_NEUTRAL_TEXT_CLASS = 'text-gray-700';
const DEBUG_EMPTY_TEXT_CLASS = 'rounded-[10px] bg-gray-50 px-3 py-3 text-[13px] leading-[18px] text-gray-500';
const DEBUG_ERROR_TEXT_CLASS = 'text-[13px] leading-[18px] text-red-700';
const CACHE_RESET_BUTTON_CLASS = 'items-center rounded-[10px] bg-red-100 px-3 py-[11px]';
const CACHE_RESET_BUTTON_TEXT_CLASS = 'text-[14px] font-bold text-red-700';
const FRAME_LIST_CLASS = 'gap-1.5';
const FRAME_ROW_CLASS = 'rounded-[10px] border border-transparent bg-gray-50 px-2.5 py-[9px]';
const FRAME_ROW_SELECTED_CLASS = 'border-blue-300 bg-blue-50';
const FRAME_ROW_TITLE_CLASS = 'text-app-caption font-bold text-gray-900';
const FRAME_ROW_META_CLASS = 'mt-[3px] text-[11px] text-gray-500';
const FRAME_JSON_BOX_CLASS = 'min-h-[140px] max-h-[260px] rounded-[10px] bg-gray-900 p-3';
const FRAME_JSON_TEXT_CLASS = 'text-[11px] leading-4 text-gray-200';
const FRAME_JSON_TEXT_STYLE = {
  fontFamily: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
} satisfies TextStyle;
const ACTIONS_CLASS = 'mt-5 flex-row gap-3';
const ACTION_BUTTON_CLASS = 'flex-1 items-center justify-center rounded-[14px] py-[14px]';
const SECONDARY_BUTTON_CLASS = 'bg-gray-100';
const SECONDARY_BUTTON_TEXT_CLASS = 'text-[15px] font-semibold text-gray-900';
const DANGER_BUTTON_CLASS = 'bg-red-100';
const DANGER_BUTTON_TEXT_CLASS = 'text-[15px] font-bold text-red-700';
const PRIMARY_BUTTON_CLASS = 'bg-gray-900';
const PRIMARY_BUTTON_TEXT_CLASS = 'text-[15px] font-bold text-white';

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

function formatHttpLabel(record: HttpDebugRecord) {
  const status = record.status === null ? '-' : String(record.status);
  return `${record.direction} / ${record.method} / ${status}`;
}

export function DevelopmentDebugPanelHost({
  isChatDetailRoute = false,
}: DevelopmentDebugPanelHostProps) {
  const insets = useSafeAreaInsets();
  const [panelSnapshot, setPanelSnapshot] = useState(() => getDevelopmentDebugPanelSnapshot());
  const [wsSnapshot, setWsSnapshot] = useState<WsDebugSnapshot>(EMPTY_WS_DEBUG_SNAPSHOT);
  const [httpSnapshot, setHttpSnapshot] = useState<HttpDebugSnapshot>(EMPTY_HTTP_DEBUG_SNAPSHOT);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [selectedHttpRecordId, setSelectedHttpRecordId] = useState<number | null>(null);
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

  useEffect(() => {
    if (!visible) {
      setHttpSnapshot(EMPTY_HTTP_DEBUG_SNAPSHOT);
      return;
    }

    return httpDebugRecorder.subscribe((nextSnapshot) => {
      setHttpSnapshot(nextSnapshot);
      setSelectedHttpRecordId((currentRecordId) => {
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
        className={FLOATING_LAYER_CLASS}
        style={{ bottom: floatingButtonBottom }}
      >
        <Pressable
          className={FLOATING_BUTTON_CLASS}
          style={FLOATING_BUTTON_SHADOW_STYLE}
          onPress={openDevelopmentDebugPanel}
        >
          <Text className={FLOATING_BUTTON_TEXT_CLASS}>Debug</Text>
        </Pressable>
      </View>
    );
  }

  const platformLabel =
    Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web';
  const apiBaseUrl = getApiBaseUrl() || '(not configured)';
  const wsRecords = [...wsSnapshot.records].reverse();
  const httpRecords = [...httpSnapshot.records].reverse();
  const selectedRecord =
    (selectedRecordId
      ? wsSnapshot.records.find((record) => record.id === selectedRecordId)
      : null) ||
    wsRecords[0] ||
    null;
  const selectedHttpRecord =
    (selectedHttpRecordId
      ? httpSnapshot.records.find((record) => record.id === selectedHttpRecordId)
      : null) ||
    httpRecords[0] ||
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
    httpDebugRecorder.setEnabled(false);
    httpDebugRecorder.clear();
    wsDebugRecorder.setEnabled(false);
    wsDebugRecorder.setMirrorToConsole(false);
    wsDebugRecorder.clear();
    setSelectedRecordId(null);
    setSelectedHttpRecordId(null);
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
      httpDebugRecorder.clear();
      wsDebugRecorder.clear();
      setSelectedRecordId(null);
      setSelectedHttpRecordId(null);
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
      <View className={BACKDROP_CLASS}>
        <Pressable className={BACKDROP_PRESS_AREA_CLASS} onPress={closeDevelopmentDebugPanel} />
        <View className={PANEL_CLASS}>
          <Text className={PANEL_TITLE_CLASS}>开发调试</Text>
          <Text className={PANEL_META_CLASS}>当前平台：{platformLabel}</Text>
          <Text className={PANEL_META_CLASS}>API Base URL：{apiBaseUrl}</Text>

          <ScrollView className={HINT_LIST_CLASS}>
            <View className={HINT_LIST_CONTENT_CLASS}>
              <Text className={HINT_TEXT_CLASS}>{primaryHint}</Text>
              <Text className={HINT_TEXT_CLASS}>{secondaryHint}</Text>
              <Text className={HINT_TEXT_CLASS}>
                如果你是通过 `expo start` 启动，终端里按 `j` 可以直接打开电脑上的 DevTools。
              </Text>
              <View className={DEBUG_SECTION_CLASS}>
                <View className={DEBUG_SECTION_HEADER_CLASS}>
                  <Text className={DEBUG_SECTION_TITLE_CLASS}>Local Cache</Text>
                  <Text className={DEBUG_SECTION_META_CLASS}>SQLite + MMKV</Text>
                </View>

              <Pressable
                disabled={isResettingCache}
                className={cn(CACHE_RESET_BUTTON_CLASS, isResettingCache && DEBUG_DISABLED_BUTTON_CLASS)}
                onPress={handleResetLocalCache}
              >
                <Text className={CACHE_RESET_BUTTON_TEXT_CLASS}>
                  {isResettingCache
                    ? '清理中...'
                    : Platform.OS === 'web'
                      ? '清理聊天缓存'
                      : '清理缓存并重载'}
                </Text>
              </Pressable>

              {cacheResetErrorText ? (
                <Text className={DEBUG_ERROR_TEXT_CLASS}>清理失败：{cacheResetErrorText}</Text>
              ) : null}
            </View>
              <View className={DEBUG_SECTION_CLASS}>
              <View className={DEBUG_SECTION_HEADER_CLASS}>
                <Text className={DEBUG_SECTION_TITLE_CLASS}>HTTP Requests</Text>
                <Text className={DEBUG_SECTION_META_CLASS}>
                  {httpSnapshot.enabled ? '捕获中' : '已停止'} · {httpSnapshot.records.length}/200
                </Text>
              </View>

              <View className={DEBUG_CONTROLS_CLASS}>
                <Pressable
                  className={cn(
                    DEBUG_CONTROL_BUTTON_CLASS,
                    httpSnapshot.enabled ? DEBUG_STOP_BUTTON_CLASS : DEBUG_START_BUTTON_CLASS
                  )}
                  onPress={() => httpDebugRecorder.setEnabled(!httpSnapshot.enabled)}
                >
                  <Text
                    className={cn(
                      DEBUG_CONTROL_TEXT_CLASS,
                      httpSnapshot.enabled ? DEBUG_STOP_TEXT_CLASS : DEBUG_START_TEXT_CLASS
                    )}
                  >
                    {httpSnapshot.enabled ? '停止捕获' : '开始捕获'}
                  </Text>
                </Pressable>
                <Pressable
                  className={cn(DEBUG_CONTROL_BUTTON_CLASS, DEBUG_NEUTRAL_BUTTON_CLASS)}
                  onPress={() => {
                    httpDebugRecorder.clear();
                    setSelectedHttpRecordId(null);
                  }}
                >
                  <Text className={cn(DEBUG_CONTROL_TEXT_CLASS, DEBUG_NEUTRAL_TEXT_CLASS)}>清空</Text>
                </Pressable>
              </View>

              {httpRecords.length <= 0 ? (
                <Text className={DEBUG_EMPTY_TEXT_CLASS}>
                  暂无 HTTP 记录。上传图片、刷新列表或触发接口请求后即可看到数据。
                </Text>
              ) : (
                <View className={FRAME_LIST_CLASS}>
                  {httpRecords.map((record) => {
                    const selected = selectedHttpRecord?.id === record.id;
                    return (
                      <Pressable
                        key={record.id}
                        className={cn(FRAME_ROW_CLASS, selected && FRAME_ROW_SELECTED_CLASS)}
                        onPress={() => setSelectedHttpRecordId(record.id)}
                      >
                        <Text className={FRAME_ROW_TITLE_CLASS} numberOfLines={1}>
                          {formatFrameTime(record.timestamp)} · {formatHttpLabel(record)}
                        </Text>
                        <Text className={FRAME_ROW_META_CLASS} numberOfLines={1}>
                          {record.url}
                          {record.durationMs === null ? '' : ` · ${record.durationMs}ms`}
                          {record.attempt && record.attempt > 1 ? ` · attempt ${record.attempt}` : ''}
                          {record.truncated ? ' · truncated' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View className={FRAME_JSON_BOX_CLASS}>
                <ScrollView nestedScrollEnabled>
                  <Text selectable className={FRAME_JSON_TEXT_CLASS} style={FRAME_JSON_TEXT_STYLE}>
                    {selectedHttpRecord ? selectedHttpRecord.json : 'No selected HTTP record.'}
                  </Text>
                </ScrollView>
              </View>
            </View>
              <View className={DEBUG_SECTION_CLASS}>
              <View className={DEBUG_SECTION_HEADER_CLASS}>
                <Text className={DEBUG_SECTION_TITLE_CLASS}>WS Frames</Text>
                <Text className={DEBUG_SECTION_META_CLASS}>
                  {wsSnapshot.enabled ? '捕获中' : '已停止'} · {wsSnapshot.records.length}/200
                </Text>
              </View>

              <View className={DEBUG_CONTROLS_CLASS}>
                <Pressable
                  className={cn(
                    DEBUG_CONTROL_BUTTON_CLASS,
                    wsSnapshot.enabled ? DEBUG_STOP_BUTTON_CLASS : DEBUG_START_BUTTON_CLASS
                  )}
                  onPress={() => wsDebugRecorder.setEnabled(!wsSnapshot.enabled)}
                >
                  <Text
                    className={cn(
                      DEBUG_CONTROL_TEXT_CLASS,
                      wsSnapshot.enabled ? DEBUG_STOP_TEXT_CLASS : DEBUG_START_TEXT_CLASS
                    )}
                  >
                    {wsSnapshot.enabled ? '停止捕获' : '开始捕获'}
                  </Text>
                </Pressable>
                <Pressable
                  className={cn(
                    DEBUG_CONTROL_BUTTON_CLASS,
                    wsSnapshot.mirrorToConsole ? DEBUG_START_BUTTON_CLASS : DEBUG_NEUTRAL_BUTTON_CLASS
                  )}
                  onPress={() => wsDebugRecorder.setMirrorToConsole(!wsSnapshot.mirrorToConsole)}
                >
                  <Text
                    className={cn(
                      DEBUG_CONTROL_TEXT_CLASS,
                      wsSnapshot.mirrorToConsole ? DEBUG_START_TEXT_CLASS : DEBUG_NEUTRAL_TEXT_CLASS
                    )}
                  >
                    Console
                  </Text>
                </Pressable>
                <Pressable
                  className={cn(DEBUG_CONTROL_BUTTON_CLASS, DEBUG_NEUTRAL_BUTTON_CLASS)}
                  onPress={() => {
                    wsDebugRecorder.clear();
                    setSelectedRecordId(null);
                  }}
                >
                  <Text className={cn(DEBUG_CONTROL_TEXT_CLASS, DEBUG_NEUTRAL_TEXT_CLASS)}>清空</Text>
                </Pressable>
              </View>

              {wsRecords.length <= 0 ? (
                <Text className={DEBUG_EMPTY_TEXT_CLASS}>
                  暂无 frame。开启捕获后发送消息、等待 push 或触发重连即可看到数据。
                </Text>
              ) : (
                <View className={FRAME_LIST_CLASS}>
                  {wsRecords.map((record) => {
                    const selected = selectedRecord?.id === record.id;
                    return (
                      <Pressable
                        key={record.id}
                        className={cn(FRAME_ROW_CLASS, selected && FRAME_ROW_SELECTED_CLASS)}
                        onPress={() => setSelectedRecordId(record.id)}
                      >
                        <Text className={FRAME_ROW_TITLE_CLASS} numberOfLines={1}>
                          {formatFrameTime(record.timestamp)} · {formatFrameLabel(record)}
                        </Text>
                        <Text className={FRAME_ROW_META_CLASS} numberOfLines={1}>
                          {record.requestId ? `${record.requestId} · ` : ''}
                          {record.payloadBytes} bytes{record.truncated ? ' · truncated' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View className={FRAME_JSON_BOX_CLASS}>
                <ScrollView nestedScrollEnabled>
                  <Text selectable className={FRAME_JSON_TEXT_CLASS} style={FRAME_JSON_TEXT_STYLE}>
                    {selectedRecord ? selectedRecord.json : 'No selected WS frame.'}
                  </Text>
                </ScrollView>
              </View>
            </View>
            </View>
          </ScrollView>

          <View className={ACTIONS_CLASS}>
            <Pressable
              className={cn(ACTION_BUTTON_CLASS, SECONDARY_BUTTON_CLASS)}
              onPress={closeDevelopmentDebugPanel}
            >
              <Text className={SECONDARY_BUTTON_TEXT_CLASS}>关闭</Text>
            </Pressable>
            <Pressable className={cn(ACTION_BUTTON_CLASS, DANGER_BUTTON_CLASS)} onPress={handleFullClose}>
              <Text className={DANGER_BUTTON_TEXT_CLASS}>彻底关闭</Text>
            </Pressable>
            <Pressable className={cn(ACTION_BUTTON_CLASS, PRIMARY_BUTTON_CLASS)} onPress={handleReload}>
              <Text className={PRIMARY_BUTTON_TEXT_CLASS}>
                {Platform.OS === 'web' ? '知道了' : '重新加载'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
