import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
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

const DOMAIN_LABEL: Record<DomainMode, string> = {
  chat: '助理',
  terminal: '终端',
  agents: '智能体',
  user: '配置'
};

const DRAWER_TITLE: Record<DomainMode, string> = {
  chat: '对话',
  terminal: '会话',
  agents: '智能体',
  user: '配置'
};

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

  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [shellKeyboardHeight, setShellKeyboardHeight] = useState(0);

  const [triggerAgents] = useLazyGetAgentsQuery();
  const [triggerChats] = useLazyGetChatsQuery();

  const drawerAnim = useRef(new Animated.Value(0)).current;
  const theme = THEMES[themeMode] || THEMES.light;
  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);

  const drawerWidth = useMemo(() => {
    const candidate = Math.floor(window.width * 0.84);
    return Math.min(DRAWER_MAX_WIDTH, Math.max(278, candidate));
  }, [window.width]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => setShellKeyboardHeight(e?.endCoordinates?.height || 0));
    const onHide = Keyboard.addListener(hideEvent, () => setShellKeyboardHeight(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  const keyboardInset = Platform.OS === 'android' ? Math.max(0, shellKeyboardHeight - insets.bottom) : 0;

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
    if (booting) return;
    refreshAll(true);
  }, [booting, refreshAll]);

  useEffect(() => {
    if (booting) return;
    patchSettings({
      themeMode,
      endpointInput,
      ptyUrlInput,
      selectedAgentKey,
      activeDomain
    }).catch(() => {});
  }, [activeDomain, booting, endpointInput, ptyUrlInput, selectedAgentKey, themeMode]);

  useEffect(() => {
    if (activeDomain !== 'chat' || drawerOpen) {
      setAgentMenuOpen(false);
    }
  }, [activeDomain, drawerOpen]);

  const activeAgentName = useMemo(() => {
    const found = agents.find((agent) => getAgentKey(agent) === selectedAgentKey);
    return getAgentName(found || agents[0]) || 'AGW';
  }, [agents, selectedAgentKey]);

  const topNavTitle = activeDomain === 'chat' ? activeAgentName : DOMAIN_LABEL[activeDomain];
  const topNavSubtitle = activeDomain === 'chat' ? selectedAgentKey : '当前功能区';

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
            style={[styles.shell, { paddingBottom: keyboardInset }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
            pointerEvents={drawerOpen ? 'none' : 'auto'}
          >
            <View style={styles.topNavCompact}>
              <TouchableOpacity
                activeOpacity={0.72}
                style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                onPress={() => {
                  setAgentMenuOpen(false);
                  dispatch(setDrawerOpen(true));
                }}
              >
                <Text style={[styles.iconOnlyBtnText, { color: theme.primaryDeep }]}>≡</Text>
              </TouchableOpacity>

              {activeDomain === 'chat' ? (
                <TouchableOpacity
                  activeOpacity={0.76}
                  style={[styles.assistantTopBtn, { backgroundColor: theme.surfaceStrong }]}
                  onPress={() => setAgentMenuOpen((prev) => !prev)}
                >
                  <View style={styles.assistantTopTextWrap}>
                    <Text style={[styles.assistantTopTitle, { color: theme.text }]} numberOfLines={1}>
                      {topNavTitle}
                    </Text>
                    <Text style={[styles.assistantTopSubTitle, { color: theme.textMute }]} numberOfLines={1}>
                      {topNavSubtitle}
                    </Text>
                  </View>
                  <Text style={[styles.assistantTopArrow, { color: theme.textMute }]}>{agentMenuOpen ? '▴' : '▾'}</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.assistantTopBtn, { backgroundColor: theme.surfaceStrong }]}>
                  <View style={styles.assistantTopTextWrap}>
                    <Text style={[styles.assistantTopTitle, { color: theme.text }]} numberOfLines={1}>
                      {topNavTitle}
                    </Text>
                    <Text style={[styles.assistantTopSubTitle, { color: theme.textMute }]} numberOfLines={1}>
                      {topNavSubtitle}
                    </Text>
                  </View>
                  <Text style={[styles.assistantTopArrow, { color: theme.textMute }]}>•</Text>
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.72}
                style={[styles.iconOnlyBtn, { backgroundColor: theme.surfaceStrong }]}
                onPress={() => {
                  dispatch(toggleTheme());
                }}
              >
                <Text style={[styles.iconOnlyBtnText, { color: theme.primaryDeep }]}>{theme.mode === 'light' ? '◐' : '◑'}</Text>
              </TouchableOpacity>
            </View>

            {activeDomain === 'chat' && agentMenuOpen ? (
              <View style={[styles.agentMenuCard, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}> 
                <ScrollView style={styles.agentMenuList} contentContainerStyle={styles.agentMenuListContent}>
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
                          styles.agentMenuItem,
                          {
                            backgroundColor: selected ? theme.primarySoft : theme.surface,
                            borderColor: selected ? theme.primary : theme.border
                          }
                        ]}
                        onPress={() => {
                          if (!key) return;
                          dispatch(setAgentsSelectedAgentKey(key));
                          dispatch(setUserSelectedAgentKey(key));
                          setAgentMenuOpen(false);
                        }}
                      >
                        <View style={styles.agentMenuItemRow}>
                          <View style={styles.agentMenuTextWrap}>
                            <Text style={[styles.agentMenuItemText, { color: selected ? theme.primaryDeep : theme.text }]}>{name}</Text>
                            <Text style={[styles.agentMenuItemSubText, { color: theme.textMute }]} numberOfLines={1}>
                              {key || '未配置 key'}
                            </Text>
                          </View>
                          {selected ? <Text style={[styles.agentMenuItemCheck, { color: theme.primary }]}>✓</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {activeDomain === 'chat' ? (
              <ChatAssistantScreen
                theme={theme}
                backendUrl={backendUrl}
                contentWidth={window.width}
                onRefreshChats={refreshChats}
                keyboardHeight={shellKeyboardHeight}
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
              <Text style={[styles.drawerTitle, { color: theme.text }]}>{DRAWER_TITLE[activeDomain]}</Text>
              <TouchableOpacity activeOpacity={0.72} style={[styles.drawerIconBtn, { backgroundColor: theme.surfaceStrong }]} onPress={() => dispatch(setDrawerOpen(false))}>
                <Text style={[styles.drawerIconText, { color: theme.textSoft }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.drawerContent}>
              {activeDomain === 'chat' ? (
                <>
                  <Text style={[styles.drawerSectionTitle, { color: theme.textSoft }]}>对话</Text>

                  <View style={styles.drawerActionRow}>
                    <TouchableOpacity
                      activeOpacity={0.74}
                      style={[styles.drawerActionBtn, { backgroundColor: theme.surfaceStrong }]}
                      onPress={() => {
                        dispatch(setChatId(''));
                        dispatch(setDrawerOpen(false));
                      }}
                    >
                      <Text style={[styles.drawerActionText, { color: theme.textSoft }]}>+ 新对话</Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    value={chatKeyword}
                    onChangeText={(text) => dispatch(setChatKeyword(text))}
                    placeholder="搜索"
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
                            <Text style={[styles.chatItemTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
                            <Text style={[styles.chatItemMeta, { color: theme.textMute }]} numberOfLines={1}>{chatMeta}</Text>
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      <View style={[styles.emptyHistoryCard, { backgroundColor: theme.surfaceStrong }]}> 
                        <Text style={[styles.emptyHistoryText, { color: theme.textMute }]}>{loadingChats ? '加载中...' : '暂无历史会话'}</Text>
                      </View>
                    )}
                  </ScrollView>
                </>
              ) : null}

              {activeDomain === 'terminal' ? (
                <>
                  <Text style={[styles.drawerSectionTitle, { color: theme.textSoft }]}>会话</Text>
                  <View style={styles.drawerActionRow}>
                    <TouchableOpacity
                      activeOpacity={0.74}
                      style={[styles.drawerActionBtn, { backgroundColor: theme.surfaceStrong }]}
                      onPress={() => dispatch(setStatusText('终端会话列表待接入'))}
                    >
                      <Text style={[styles.drawerActionText, { color: theme.textSoft }]}>+ 新会话</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.emptyHistoryCard, { backgroundColor: theme.surfaceStrong, marginTop: 8 }]}> 
                    <Text style={[styles.emptyHistoryText, { color: theme.textMute }]}>暂无终端会话</Text>
                  </View>
                </>
              ) : null}

              {activeDomain === 'agents' ? (
                <>
                  <Text style={[styles.drawerSectionTitle, { color: theme.textSoft }]}>智能体列表</Text>
                  <ScrollView style={styles.chatListWrap} contentContainerStyle={styles.chatListContent}>
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
                            styles.chatItem,
                            {
                              backgroundColor: selected ? theme.primarySoft : theme.surfaceStrong
                            }
                          ]}
                          onPress={() => {
                            if (!key) return;
                            dispatch(setAgentsSelectedAgentKey(key));
                            dispatch(setUserSelectedAgentKey(key));
                          }}
                        >
                          <Text style={[styles.chatItemTitle, { color: selected ? theme.primaryDeep : theme.text }]} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={[styles.chatItemMeta, { color: theme.textMute }]} numberOfLines={1}>
                            {key || '未配置 key'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              {activeDomain === 'user' ? (
                <View style={styles.nonChatHintWrap}>
                  <Text style={[styles.nonChatHint, { color: theme.textSoft }]}>配置项请在主内容区编辑。</Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.drawerBottom, { borderTopColor: theme.border }]}>
              <View style={styles.profileDomainRow}>
                <View style={[styles.profileAvatar, { backgroundColor: theme.primary }]}>
                  <Text style={styles.profileAvatarText}>L</Text>
                </View>
                <DomainSwitcher
                  value={activeDomain}
                  onChange={(mode: DomainMode) => {
                    setAgentMenuOpen(false);
                    dispatch(setActiveDomain(mode));
                    dispatch(setDrawerOpen(false));
                  }}
                  theme={theme}
                  compact
                />
              </View>

              <View style={styles.drawerStatusRow}>{agentsLoading ? <ActivityIndicator size="small" color={theme.primary} /> : null}</View>
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
    justifyContent: 'center'
  },
  iconOnlyBtnText: {
    fontSize: 17,
    fontWeight: '700'
  },
  assistantTopBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12
  },
  assistantTopTextWrap: {
    flex: 1,
    minWidth: 0
  },
  assistantTopTitle: {
    fontSize: 17,
    fontWeight: '700'
  },
  assistantTopSubTitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500'
  },
  assistantTopArrow: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '700'
  },
  agentMenuCard: {
    marginHorizontal: 14,
    marginTop: 0,
    marginBottom: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 280,
    overflow: 'hidden'
  },
  agentMenuList: {
    flexGrow: 0
  },
  agentMenuListContent: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8
  },
  agentMenuItem: {
    borderRadius: 12,
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  agentMenuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  agentMenuTextWrap: {
    flex: 1,
    minWidth: 0
  },
  agentMenuItemText: {
    fontSize: 14,
    fontWeight: '700'
  },
  agentMenuItemSubText: {
    marginTop: 2,
    fontSize: 11
  },
  agentMenuItemCheck: {
    fontSize: 16,
    fontWeight: '800'
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
    paddingHorizontal: 12,
    gap: 10
  },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700'
  },
  drawerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  drawerIconText: {
    fontSize: 13,
    fontWeight: '700'
  },
  drawerContent: {
    flex: 1
  },
  drawerSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8
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
    fontWeight: '700'
  },
  chatItemMeta: {
    marginTop: 4,
    fontSize: 11
  },
  emptyHistoryCard: {
    borderRadius: 10,
    paddingVertical: 22,
    alignItems: 'center'
  },
  emptyHistoryText: {
    fontSize: 12
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
  drawerBottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10
  },
  profileDomainRow: {
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
  drawerStatusRow: {
    minHeight: 16,
    alignItems: 'flex-end',
    justifyContent: 'center'
  }
});
