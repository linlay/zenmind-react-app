import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { DomainMode } from '../../core/types/common';
import { THEMES } from '../../core/constants/theme';
import { toBackendBaseUrl } from '../../core/network/endpoint';
import { loadSettings, patchSettings } from '../../core/storage/settingsStorage';
import { setDrawerOpen } from './shellSlice';
import {
  hydrateSettings,
  setActiveDomain,
  setSelectedAgentKey as setUserSelectedAgentKey,
  toggleTheme
} from '../../modules/user/state/userSlice';
import {
  setAgents,
  setAgentsError,
  setAgentsLoading,
  setSelectedAgentKey as setAgentsSelectedAgentKey
} from '../../modules/agents/state/agentsSlice';
import {
  setChatId,
  setChatKeyword,
  setChats,
  setLoadingChats,
  setStatusText
} from '../../modules/chat/state/chatSlice';
import { selectFilteredChats } from '../../modules/chat/state/chatSelectors';
import { ChatAssistantScreen } from '../../modules/chat/screens/ChatAssistantScreen';
import { TerminalScreen } from '../../modules/terminal/screens/TerminalScreen';
import { AgentsScreen } from '../../modules/agents/screens/AgentsScreen';
import { UserSettingsScreen } from '../../modules/user/screens/UserSettingsScreen';
import { DomainSwitcher } from './DomainSwitcher';
import { useLazyGetAgentsQuery } from '../../modules/agents/api/agentsApi';
import { useLazyGetChatsQuery } from '../../modules/chat/api/chatApi';
import { formatError } from '../../core/network/apiClient';
import { getAgentKey, getAgentName, getChatTitle } from '../../shared/utils/format';

const DRAWER_MAX_WIDTH = 332;

export function ShellScreen() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const drawerOpen = useAppSelector((state) => state.shell.drawerOpen);
  const {
    booting,
    themeMode,
    endpointInput,
    ptyUrlInput,
    selectedAgentKey,
    activeDomain
  } = useAppSelector((state) => state.user);
  const chatId = useAppSelector((state) => state.chat.chatId);
  const chatKeyword = useAppSelector((state) => state.chat.chatKeyword);
  const loadingChats = useAppSelector((state) => state.chat.loadingChats);
  const agentsLoading = useAppSelector((state) => state.agents.loading);
  const agents = useAppSelector((state) => state.agents.agents);
  const filteredChats = useAppSelector(selectFilteredChats);

  const [triggerAgents] = useLazyGetAgentsQuery();
  const [triggerChats] = useLazyGetChatsQuery();

  const drawerAnim = useRef(new Animated.Value(0)).current;
  const theme = THEMES[themeMode] || THEMES.light;
  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);

  const drawerWidth = useMemo(() => {
    const candidate = Math.floor(window.width * 0.84);
    return Math.min(DRAWER_MAX_WIDTH, Math.max(278, candidate));
  }, [window.width]);

  const drawerTranslateX = useMemo(
    () =>
      drawerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-drawerWidth, 0]
      }),
    [drawerAnim, drawerWidth]
  );

  const mainTranslateX = useMemo(
    () =>
      drawerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, drawerWidth - 42]
      }),
    [drawerAnim, drawerWidth]
  );

  const refreshAgents = useCallback(
    async (base = backendUrl, silent = false) => {
      if (!silent) dispatch(setAgentsLoading(true));
      try {
        const list = await triggerAgents(base, true).unwrap();
        dispatch(setAgents(list));
        dispatch(setAgentsError(''));

        const current = selectedAgentKey;
        if (current && list.some((agent) => getAgentKey(agent) === current)) {
          return;
        }

        const fallback = getAgentKey(list[0]) || '';
        dispatch(setAgentsSelectedAgentKey(fallback));
        dispatch(setUserSelectedAgentKey(fallback));
      } catch (error) {
        dispatch(setAgentsError(formatError(error)));
        dispatch(setStatusText(`Agent 加载失败：${formatError(error)}`));
      } finally {
        if (!silent) dispatch(setAgentsLoading(false));
      }
    },
    [backendUrl, dispatch, selectedAgentKey, triggerAgents]
  );

  const refreshChats = useCallback(
    async (silent = false) => {
      if (!silent) dispatch(setLoadingChats(true));
      try {
        const list = await triggerChats(backendUrl, true).unwrap();
        dispatch(setChats(list));
      } catch (error) {
        dispatch(setStatusText(`会话列表加载失败：${formatError(error)}`));
      } finally {
        if (!silent) dispatch(setLoadingChats(false));
      }
    },
    [backendUrl, dispatch, triggerChats]
  );

  const refreshAll = useCallback(
    async (silent = false) => {
      await Promise.all([refreshAgents(backendUrl, silent), refreshChats(silent)]);
    },
    [backendUrl, refreshAgents, refreshChats]
  );

  useEffect(() => {
    let mounted = true;
    loadSettings()
      .then((settings) => {
        if (!mounted) return;
        dispatch(hydrateSettings(settings));
        dispatch(setAgentsSelectedAgentKey(settings.selectedAgentKey || ''));
      })
      .catch(() => {
        if (!mounted) return;
        dispatch(hydrateSettings({}));
      });

    return () => {
      mounted = false;
    };
  }, [dispatch]);

  useEffect(() => {
    Animated.timing(drawerAnim, {
      toValue: drawerOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [drawerAnim, drawerOpen]);

  useEffect(() => {
    if (booting) {
      return;
    }

    refreshAll(true);
  }, [booting, refreshAll]);

  useEffect(() => {
    if (booting) {
      return;
    }

    patchSettings({
      themeMode,
      endpointInput,
      ptyUrlInput,
      selectedAgentKey,
      activeDomain
    }).catch(() => {});
  }, [activeDomain, booting, endpointInput, ptyUrlInput, selectedAgentKey, themeMode]);

  const activeAgentName = useMemo(() => {
    const found = agents.find((agent) => getAgentKey(agent) === selectedAgentKey);
    return getAgentName(found || agents[0]) || 'AGW';
  }, [agents, selectedAgentKey]);

  const agentBadgeLetter = activeAgentName.trim().charAt(0).toUpperCase() || 'A';

  if (booting) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeRoot}>
        <LinearGradient colors={theme.gradient} style={styles.gradientFill}>
          <View style={styles.bootWrap}>
            <View style={styles.bootCard}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={styles.bootText}>正在加载配置...</Text>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeRoot}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />

      <LinearGradient colors={theme.gradient} style={styles.gradientFill}>
        <View pointerEvents="none" style={styles.bgDecorWrap}>
          <View style={[styles.bgCircleA, { backgroundColor: theme.bgCircleA }]} />
          <View style={[styles.bgCircleB, { backgroundColor: theme.bgCircleB }]} />
        </View>

        <Animated.View style={[styles.mainShell, { transform: [{ translateX: mainTranslateX }] }]}>
          <KeyboardAvoidingView
            style={styles.shell}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
            pointerEvents={drawerOpen ? 'none' : 'auto'}
          >
            <View style={styles.topNavCompact}>
              <TouchableOpacity activeOpacity={0.72} style={styles.iconOnlyBtn} onPress={() => dispatch(setDrawerOpen(true))}>
                <Text style={styles.iconOnlyBtnText}>≡</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={activeDomain === 'chat' ? 0.78 : 1}
                style={[styles.agentCompactBtn, { backgroundColor: theme.surfaceStrong }]}
              >
                <View style={[styles.agentCompactAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.agentCompactAvatarText}>{activeDomain === 'chat' ? agentBadgeLetter : activeDomain.slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={styles.agentCompactName} numberOfLines={1}>
                  {activeDomain === 'chat'
                    ? activeAgentName
                    : activeDomain === 'terminal'
                      ? '终端管理'
                      : activeDomain === 'agents'
                        ? '智能体管理'
                        : '用户配置'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.72}
                style={styles.iconOnlyBtn}
                onPress={() => {
                  dispatch(toggleTheme());
                }}
              >
                <Text style={styles.iconOnlyBtnText}>{theme.mode === 'light' ? '◐' : '◑'}</Text>
              </TouchableOpacity>
            </View>

            {activeDomain === 'chat' ? (
              <ChatAssistantScreen
                theme={theme}
                backendUrl={backendUrl}
                contentWidth={window.width}
                onRefreshChats={refreshChats}
              />
            ) : null}

            {activeDomain === 'terminal' ? <TerminalScreen theme={theme} /> : null}
            {activeDomain === 'agents' ? <AgentsScreen theme={theme} /> : null}
            {activeDomain === 'user' ? <UserSettingsScreen theme={theme} onSettingsApplied={() => refreshAll(true)} /> : null}
          </KeyboardAvoidingView>
        </Animated.View>

        <View pointerEvents={drawerOpen ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.drawerOverlay, { opacity: drawerAnim }]}> 
            <Pressable style={StyleSheet.absoluteFill} onPress={() => dispatch(setDrawerOpen(false))} />
          </Animated.View>

          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: drawerWidth,
                paddingTop: insets.top + 8,
                transform: [{ translateX: drawerTranslateX }],
                backgroundColor: theme.surface
              }
            ]}
          >
            <View style={styles.drawerHead}>
              <Text style={styles.drawerTitle}>会话与域切换</Text>
              <TouchableOpacity activeOpacity={0.72} style={styles.drawerIconBtn} onPress={() => dispatch(setDrawerOpen(false))}>
                <Text style={styles.drawerIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            <DomainSwitcher
              value={activeDomain}
              onChange={(mode: DomainMode) => {
                dispatch(setActiveDomain(mode));
                dispatch(setDrawerOpen(false));
              }}
              theme={theme}
            />

            {activeDomain === 'chat' ? (
              <>
                <View style={styles.drawerActionRow}>
                  <TouchableOpacity
                    activeOpacity={0.74}
                    style={[styles.drawerActionBtn, { backgroundColor: theme.surfaceStrong }]}
                    onPress={() => {
                      dispatch(setChatId(''));
                      dispatch(setDrawerOpen(false));
                    }}
                  >
                    <Text style={styles.drawerActionText}>+ 新会话</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.74}
                    style={[styles.drawerActionBtn, { backgroundColor: theme.surfaceStrong }]}
                    onPress={() => refreshChats(false)}
                  >
                    <Text style={styles.drawerActionText}>刷新</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  value={chatKeyword}
                  onChangeText={(text) => dispatch(setChatKeyword(text))}
                  placeholder="搜索会话"
                  placeholderTextColor={theme.textMute}
                  style={[styles.chatSearchInput, { backgroundColor: theme.surfaceStrong, color: theme.text }]}
                />

                <ScrollView style={styles.chatListWrap} contentContainerStyle={styles.chatListContent}>
                  {filteredChats.length ? (
                    filteredChats.map((chat, index) => {
                      const active = chat.chatId === chatId;
                      const title = getChatTitle(chat) || chat.chatId || '未命名会话';
                      const chatMetaParts: string[] = [];
                      if (chat.firstAgentKey) chatMetaParts.push(`@${chat.firstAgentKey}`);
                      if (chat.chatId) chatMetaParts.push(chat.chatId);
                      const chatMeta = chatMetaParts.join(' · ');
                      const itemKey = chat.chatId || `${title}:${index}`;

                      return (
                        <TouchableOpacity
                          key={itemKey}
                          activeOpacity={0.74}
                          style={[styles.chatItem, { backgroundColor: active ? theme.primarySoft : theme.surfaceStrong }]}
                          onPress={() => {
                            if (!chat.chatId) return;
                            dispatch(setChatId(chat.chatId));
                            dispatch(setDrawerOpen(false));
                          }}
                        >
                          <Text style={styles.chatItemTitle} numberOfLines={1}>{title}</Text>
                          <Text style={styles.chatItemMeta} numberOfLines={1}>{chatMeta}</Text>
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <View style={styles.emptyHistoryCard}>
                      <Text style={styles.emptyHistoryText}>{loadingChats ? '加载中...' : '暂无历史会话'}</Text>
                    </View>
                  )}
                </ScrollView>

                <View style={styles.agentBlock}>
                  <Text style={[styles.agentTitle, { color: theme.textSoft }]}>Agent</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentListRow}>
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
                            styles.agentChip,
                            {
                              backgroundColor: selected ? theme.primarySoft : theme.surfaceStrong,
                              borderColor: selected ? theme.primary : 'transparent'
                            }
                          ]}
                          onPress={() => {
                            if (!key) return;
                            dispatch(setAgentsSelectedAgentKey(key));
                            dispatch(setUserSelectedAgentKey(key));
                          }}
                        >
                          <Text style={{ color: selected ? theme.primaryDeep : theme.textSoft, fontSize: 12, fontWeight: '600' }}>{name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </>
            ) : (
              <View style={styles.nonChatHintWrap}>
                <Text style={[styles.nonChatHint, { color: theme.textSoft }]}>当前是 {activeDomain} 域，主内容区可直接操作。</Text>
              </View>
            )}

            <View style={styles.drawerFooter}>
              <View style={styles.profileRow}>
                <View style={[styles.profileAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.profileAvatarText}>L</Text>
                </View>
                <Text style={[styles.profileName, { color: theme.text }]}>Linlay</Text>
              </View>
              <View style={styles.drawerStatusRow}>
                {agentsLoading ? <ActivityIndicator size="small" color={theme.primary} /> : null}
              </View>
            </View>
          </Animated.View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1
  },
  gradientFill: {
    flex: 1
  },
  mainShell: {
    flex: 1
  },
  shell: {
    flex: 1
  },
  bgDecorWrap: {
    ...StyleSheet.absoluteFillObject
  },
  bgCircleA: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: 135,
    top: -130,
    right: -50
  },
  bgCircleB: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    left: -90,
    bottom: 110
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
    backgroundColor: 'rgba(255,255,255,0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  bootText: {
    fontSize: 14,
    color: '#60728f'
  },
  topNavCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 10,
    gap: 10
  },
  iconOnlyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)'
  },
  iconOnlyBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2f6cf3'
  },
  agentCompactBtn: {
    flex: 1,
    borderRadius: 12,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 9
  },
  agentCompactAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  agentCompactAvatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800'
  },
  agentCompactName: {
    flex: 1,
    color: '#27334a',
    fontSize: 13,
    fontWeight: '700'
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.22)'
  },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: 12
  },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  drawerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#27334a'
  },
  drawerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)'
  },
  drawerIconText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#60728f'
  },
  drawerActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  drawerActionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center'
  },
  drawerActionText: {
    color: '#60728f',
    fontSize: 12,
    fontWeight: '700'
  },
  chatSearchInput: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    marginBottom: 10
  },
  chatListWrap: {
    flex: 1
  },
  chatListContent: {
    paddingBottom: 12,
    gap: 8
  },
  chatItem: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  chatItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#27334a'
  },
  chatItemMeta: {
    marginTop: 4,
    fontSize: 11,
    color: '#8d9bb2'
  },
  emptyHistoryCard: {
    borderRadius: 10,
    paddingVertical: 22,
    alignItems: 'center'
  },
  emptyHistoryText: {
    color: '#8d9bb2',
    fontSize: 12
  },
  agentBlock: {
    marginTop: 8,
    marginBottom: 10
  },
  agentTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8
  },
  agentListRow: {
    gap: 8,
    paddingRight: 8
  },
  agentChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  nonChatHintWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16
  },
  nonChatHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20
  },
  drawerFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d4dfef',
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  profileAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  profileName: {
    fontSize: 13,
    fontWeight: '700'
  },
  drawerStatusRow: {
    minWidth: 20,
    alignItems: 'flex-end'
  }
});
