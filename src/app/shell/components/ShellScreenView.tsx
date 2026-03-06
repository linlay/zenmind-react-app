import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { BottomDomainNav } from '../BottomDomainNav';
import { ShellTopNav } from './ShellTopNav';
import { styles } from '../ShellScreen.styles';
import { ShellScreenController } from '../hooks/useShellScreenController';
import { buildShellRouteModel } from '../routes/shellRouteModel';
import { buildShellRouteSnapshot } from '../routes/shellRouteSnapshot';
import { ShellTabNavigation, ShellTabParamList } from '../types';
import { AgentsRootNavigation, AgentsRouteName, AgentsRuntimeBridge } from '../pages/agents/types';
import { ChatRootNavigation, ChatRouteName } from '../pages/chat/types';
import { TerminalRootNavigation, TerminalRouteName, TerminalRuntimeBridge } from '../pages/terminal/types';
import { ShellChatTabScreen } from '../pages/chat';
import { ShellTerminalTabScreen } from '../pages/terminal';
import { ShellAgentsTabScreen } from '../pages/agents';
import { ShellUserTabScreen } from '../pages/user';
import { AgentSidebar } from '../../../modules/chat/components/AgentSidebar';
import { ChatDetailDrawer } from '../../../modules/chat/components/ChatDetailDrawer';
import {
  closeChatDetailDrawer,
  openChatDetailDrawer,
  resetChatDetailDrawerPreview,
  setChatAgentsSidebarOpen,
  setChatDetailDrawerPreviewProgress,
  setChatSearchQuery as setShellChatSearchQuery
} from '../shellSlice';
import { setStatusText, setChatId } from '../../../modules/chat/state/chatSlice';
import {
  setActiveDomain,
  setSelectedAgentKey as setUserSelectedAgentKey,
  toggleTheme
} from '../../../modules/user/state/userSlice';
import { reloadPty } from '../../../modules/terminal/state/terminalSlice';
import { DomainMode } from '../../../core/types/common';
import { formatInboxTime } from '../../../shared/utils/format';

interface ShellScreenViewProps {
  controller: ShellScreenController;
}

type ShellTabName = keyof ShellTabParamList;

const DOMAIN_TO_TAB: Record<DomainMode, ShellTabName> = {
  chat: 'Chat',
  terminal: 'Terminal',
  agents: 'Agents',
  user: 'User'
};

const Tab = createBottomTabNavigator<ShellTabParamList>();

export function ShellScreenView({ controller }: ShellScreenViewProps) {
  const {
    dispatch,
    insets,
    window,
    theme,
    keyboardInset,
    inboxOpen,
    chatPlusMenuOpen,
    chatSearchQuery,
    chatAgentsSidebarOpen,
    chatDetailDrawerOpen,
    chatDetailDrawerPreviewProgress,
    inboxMessages,
    inboxUnreadCount,
    inboxLoading,
    terminalSessions,
    terminalSessionsLoading,
    terminalSessionsError,
    terminalCurrentWebViewUrl,
    activeTerminalSessionId,
    activeDomain,
    selectedAgentKey,
    authAccessToken,
    authAccessExpireAtMs,
    authTokenSignal,
    authUsername,
    authDeviceName,
    currentAgentChats,
    chatId,
    agents,
    activeAgentName,
    activeAgentRole,
    chatRefreshSignal,
    inboxAnim,
    appVersionLabel,
    setInboxOpen,
    setChatPlusMenuOpen,
    setChatSearchQuery,
    refreshTerminalSessions,
    openTerminalCreateSessionModal,
    openTerminalDetail,
    handleTerminalWebViewUrlChange,
    handleRequestSwitchAgentChat,
    handleWebViewAuthRefreshRequest,
    markChatViewed,
    refreshChats,
    refreshAll,
    handleLogout,
    markAllInboxRead,
    markInboxRead,
    closeFloatingPanels,
    terminalListResetSignal
  } = controller;

  const rootTabNavigationRef = useRef<ShellTabNavigation | null>(null);
  const agentsNavigationRef = useRef<AgentsRootNavigation | null>(null);
  const chatNavigationRef = useRef<ChatRootNavigation | null>(null);
  const terminalNavigationRef = useRef<TerminalRootNavigation | null>(null);
  const previousFocusedDomainRef = useRef<DomainMode>(activeDomain);

  const [focusedDomain, setFocusedDomain] = useState<DomainMode>(activeDomain);
  const [agentsFocusedRoute, setAgentsFocusedRoute] = useState<AgentsRouteName>('AgentsList');
  const [chatFocusedRoute, setChatFocusedRoute] = useState<ChatRouteName>('ChatList');
  const [terminalFocusedRoute, setTerminalFocusedRoute] = useState<TerminalRouteName>('TerminalList');

  const routeSnapshot = useMemo(
    () =>
      buildShellRouteSnapshot({
        activeDomain: focusedDomain,
        agentsRouteName: agentsFocusedRoute,
        chatRouteName: chatFocusedRoute,
        terminalRouteName: terminalFocusedRoute
      }),
    [agentsFocusedRoute, chatFocusedRoute, focusedDomain, terminalFocusedRoute]
  );

  const routeModel = useMemo(
    () =>
      buildShellRouteModel({
        routeSnapshot,
        activeAgentName,
        activeAgentRole
      }),
    [activeAgentName, activeAgentRole, routeSnapshot]
  );

  const bindRootTabNavigation = useCallback((navigation: ShellTabNavigation) => {
    rootTabNavigationRef.current = navigation;
  }, []);

  const handleDomainFocus = useCallback(
    (domain: DomainMode) => {
      setFocusedDomain((prev) => (prev === domain ? prev : domain));
      if (activeDomain !== domain) {
        dispatch(setActiveDomain(domain));
      }
    },
    [activeDomain, dispatch]
  );

  const bindChatNavigation = useCallback((navigation: ChatRootNavigation) => {
    chatNavigationRef.current = navigation;
  }, []);

  const bindAgentsNavigation = useCallback((navigation: AgentsRootNavigation) => {
    agentsNavigationRef.current = navigation;
  }, []);

  const bindTerminalNavigation = useCallback((navigation: TerminalRootNavigation) => {
    terminalNavigationRef.current = navigation;
  }, []);

  const handleAgentsRouteFocus = useCallback((routeName: AgentsRouteName) => {
    setAgentsFocusedRoute(routeName);
  }, []);

  const handleChatRouteFocus = useCallback((routeName: ChatRouteName) => {
    setChatFocusedRoute(routeName);
  }, []);

  const handleTerminalRouteFocus = useCallback((routeName: TerminalRouteName) => {
    setTerminalFocusedRoute(routeName);
  }, []);

  const goBackOrNavigateChatList = useCallback(() => {
    const navigation = chatNavigationRef.current;
    if (!navigation) return;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('ChatList');
  }, []);

  const goBackOrNavigateAgentsList = useCallback(() => {
    const navigation = agentsNavigationRef.current;
    if (!navigation) return;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('AgentsList');
  }, []);

  const goBackOrNavigateTerminalList = useCallback(() => {
    const navigation = terminalNavigationRef.current;
    if (!navigation) return;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('TerminalList');
  }, []);

  const resetTerminalStackToList = useCallback(() => {
    const navigation = terminalNavigationRef.current;
    if (!navigation) return;
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'TerminalList' }]
      })
    );
  }, []);

  const resetAgentsStackToList = useCallback(() => {
    const navigation = agentsNavigationRef.current;
    if (!navigation) {
      return;
    }
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'AgentsList' }]
      })
    );
  }, []);

  useEffect(() => {
    if (routeSnapshot.chatRouteName === 'ChatList') {
      return;
    }
    if (chatPlusMenuOpen) {
      setChatPlusMenuOpen(false);
    }
  }, [chatPlusMenuOpen, routeSnapshot.chatRouteName, setChatPlusMenuOpen]);

  useEffect(() => {
    if (routeSnapshot.activeDomain === 'chat' && routeSnapshot.chatRouteName === 'ChatDetail') {
      return;
    }
    if (chatDetailDrawerOpen) {
      dispatch(closeChatDetailDrawer());
    }
    if (chatDetailDrawerPreviewProgress > 0) {
      dispatch(resetChatDetailDrawerPreview());
    }
  }, [
    chatDetailDrawerOpen,
    chatDetailDrawerPreviewProgress,
    dispatch,
    routeSnapshot.activeDomain,
    routeSnapshot.chatRouteName
  ]);

  useEffect(() => {
    if (!terminalListResetSignal) {
      return;
    }
    resetTerminalStackToList();
  }, [resetTerminalStackToList, terminalListResetSignal]);

  useEffect(() => {
    const previousDomain = previousFocusedDomainRef.current;
    previousFocusedDomainRef.current = routeSnapshot.activeDomain;

    if (
      routeSnapshot.activeDomain === 'terminal' &&
      previousDomain !== 'terminal' &&
      routeSnapshot.terminalPane !== 'list'
    ) {
      resetTerminalStackToList();
    }
  }, [resetTerminalStackToList, routeSnapshot.activeDomain, routeSnapshot.terminalPane]);

  useEffect(() => {
    if (routeSnapshot.activeDomain === 'agents' || routeSnapshot.agentsPane === 'list') return;
    resetAgentsStackToList();
  }, [resetAgentsStackToList, routeSnapshot.activeDomain, routeSnapshot.agentsPane]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inboxOpen) {
        setInboxOpen(false);
        return true;
      }
      if (chatDetailDrawerOpen) {
        dispatch(closeChatDetailDrawer());
        return true;
      }
      if (chatAgentsSidebarOpen) {
        dispatch(setChatAgentsSidebarOpen(false));
        return true;
      }
      if (routeSnapshot.activeDomain === 'chat' && routeSnapshot.chatMode === 'search') {
        setChatPlusMenuOpen(false);
        dispatch(setShellChatSearchQuery(''));
        goBackOrNavigateChatList();
        return true;
      }
      if (routeSnapshot.activeDomain === 'chat' && chatNavigationRef.current?.canGoBack()) {
        goBackOrNavigateChatList();
        return true;
      }
      if (routeSnapshot.activeDomain === 'terminal' && terminalNavigationRef.current?.canGoBack()) {
        goBackOrNavigateTerminalList();
        return true;
      }
      if (routeSnapshot.activeDomain === 'agents' && agentsNavigationRef.current?.canGoBack()) {
        goBackOrNavigateAgentsList();
        return true;
      }
      return false;
    });

    return () => sub.remove();
  }, [
    chatAgentsSidebarOpen,
    chatDetailDrawerOpen,
    dispatch,
    goBackOrNavigateAgentsList,
    goBackOrNavigateChatList,
    goBackOrNavigateTerminalList,
    inboxOpen,
    routeSnapshot.activeDomain,
    routeSnapshot.chatMode,
    setChatPlusMenuOpen,
    setInboxOpen
  ]);

  const handleChatOverlayBack = useCallback(() => {
    setInboxOpen(false);
    if (chatDetailDrawerOpen) {
      dispatch(closeChatDetailDrawer());
      return;
    }
    goBackOrNavigateChatList();
  }, [chatDetailDrawerOpen, dispatch, goBackOrNavigateChatList, setInboxOpen]);

  const handleChatSearchBack = useCallback(() => {
    setChatPlusMenuOpen(false);
    dispatch(setShellChatSearchQuery(''));
    goBackOrNavigateChatList();
  }, [dispatch, goBackOrNavigateChatList, setChatPlusMenuOpen]);

  const handleChatListSearch = useCallback(() => {
    setChatPlusMenuOpen(false);
    chatNavigationRef.current?.navigate('ChatSearch');
  }, [setChatPlusMenuOpen]);

  const handleSidebarSelectAgent = useCallback(
    (agentKey: string) => {
      const normalizedAgentKey = String(agentKey || '').trim();
      if (!normalizedAgentKey) {
        return;
      }
      dispatch(setUserSelectedAgentKey(normalizedAgentKey));
      dispatch(setChatId(''));
      dispatch(setStatusText(''));
      dispatch(setChatAgentsSidebarOpen(false));
      dispatch(closeChatDetailDrawer());
      dispatch(resetChatDetailDrawerPreview());
      chatNavigationRef.current?.navigate('ChatDetail', {
        chatId: '',
        agentKey: normalizedAgentKey
      });
    },
    [dispatch]
  );

  const handleCreateCurrentAgentChat = useCallback(() => {
    dispatch(setChatId(''));
    dispatch(setStatusText(''));
    dispatch(closeChatDetailDrawer());
    dispatch(resetChatDetailDrawerPreview());
    setChatPlusMenuOpen(false);
    const normalizedAgentKey = String(selectedAgentKey || '').trim();
    chatNavigationRef.current?.navigate('ChatDetail', {
      chatId: '',
      agentKey: normalizedAgentKey || undefined
    });
  }, [dispatch, selectedAgentKey, setChatPlusMenuOpen]);

  const handleGestureCreateAgentChatBySwipe = useCallback(() => {
    handleCreateCurrentAgentChat();
    return {
      ok: true,
      message: '已新建当前智能体对话'
    };
  }, [handleCreateCurrentAgentChat]);

  const handleGesturePreviewChatDetailDrawer = useCallback(
    (progress: number) => {
      if (
        !(routeSnapshot.activeDomain === 'chat' && routeSnapshot.chatOverlayType === 'chatDetail') ||
        chatDetailDrawerOpen
      ) {
        dispatch(resetChatDetailDrawerPreview());
        return;
      }
      dispatch(setChatDetailDrawerPreviewProgress(progress));
    },
    [chatDetailDrawerOpen, dispatch, routeSnapshot.activeDomain, routeSnapshot.chatOverlayType]
  );

  const handleGestureShowChatDetailDrawer = useCallback(() => {
    if (!(routeSnapshot.activeDomain === 'chat' && routeSnapshot.chatOverlayType === 'chatDetail')) {
      dispatch(resetChatDetailDrawerPreview());
      return;
    }
    setInboxOpen(false);
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(openChatDetailDrawer());
  }, [dispatch, routeSnapshot.activeDomain, routeSnapshot.chatOverlayType, setInboxOpen]);

  const chatDetailRuntime = useMemo(
    () => ({
      onRefreshChats: refreshChats,
      keyboardHeight: keyboardInset,
      refreshSignal: chatRefreshSignal,
      authAccessToken,
      authAccessExpireAtMs,
      authTokenSignal,
      onWebViewAuthRefreshRequest: handleWebViewAuthRefreshRequest,
      onChatViewed: markChatViewed,
      onRequestSwitchAgentChat: handleRequestSwitchAgentChat,
      onRequestCreateAgentChatBySwipe: handleGestureCreateAgentChatBySwipe,
      onRequestPreviewChatDetailDrawer: handleGesturePreviewChatDetailDrawer,
      onRequestShowChatDetailDrawer: handleGestureShowChatDetailDrawer,
      chatDetailDrawerOpen
    }),
    [
      authAccessExpireAtMs,
      authAccessToken,
      authTokenSignal,
      chatDetailDrawerOpen,
      chatRefreshSignal,
      handleGestureCreateAgentChatBySwipe,
      handleGesturePreviewChatDetailDrawer,
      handleGestureShowChatDetailDrawer,
      handleRequestSwitchAgentChat,
      handleWebViewAuthRefreshRequest,
      keyboardInset,
      markChatViewed,
      refreshChats
    ]
  );

  const terminalRuntime = useMemo<TerminalRuntimeBridge>(
    () => ({
      sessions: terminalSessions,
      loading: terminalSessionsLoading,
      error: terminalSessionsError,
      activeSessionId: activeTerminalSessionId,
      currentWebViewUrl: terminalCurrentWebViewUrl,
      onRefreshSessions: async () => {
        await refreshTerminalSessions();
      },
      onCreateSession: openTerminalCreateSessionModal,
      onOpenSession: openTerminalDetail,
      authAccessToken,
      authAccessExpireAtMs,
      authTokenSignal,
      onTerminalUrlChange: handleTerminalWebViewUrlChange,
      onWebViewAuthRefreshRequest: handleWebViewAuthRefreshRequest
    }),
    [
      activeTerminalSessionId,
      authAccessExpireAtMs,
      authAccessToken,
      authTokenSignal,
      handleTerminalWebViewUrlChange,
      handleWebViewAuthRefreshRequest,
      openTerminalCreateSessionModal,
      openTerminalDetail,
      refreshTerminalSessions,
      terminalCurrentWebViewUrl,
      terminalSessions,
      terminalSessionsError,
      terminalSessionsLoading
    ]
  );

  const agentsRuntime = useMemo<AgentsRuntimeBridge>(
    () => ({
      theme,
      selectedAgentKey,
      onSubmitPublish: () => {
        dispatch(setStatusText('发布任务已创建（演示）'));
      },
      onClosePublish: () => {}
    }),
    [dispatch, selectedAgentKey, theme]
  );

  const handleDomainTabPress = useCallback(
    (mode: DomainMode) => {
      if (mode === routeSnapshot.activeDomain) {
        setInboxOpen(false);

        if (mode === 'chat') {
          if (chatDetailDrawerOpen) {
            dispatch(closeChatDetailDrawer());
            return;
          }
          if (chatAgentsSidebarOpen) {
            dispatch(setChatAgentsSidebarOpen(false));
            return;
          }
          if (routeSnapshot.chatMode === 'search') {
            setChatPlusMenuOpen(false);
            dispatch(setShellChatSearchQuery(''));
            goBackOrNavigateChatList();
            return;
          }
          if (routeSnapshot.hasChatOverlay) {
            goBackOrNavigateChatList();
            return;
          }
          return;
        }

        if (mode === 'agents' && routeSnapshot.agentsPane === 'publish') {
          goBackOrNavigateAgentsList();
          return;
        }

        if (mode === 'terminal' && routeSnapshot.terminalPane !== 'list') {
          goBackOrNavigateTerminalList();
        }
        return;
      }

      closeFloatingPanels();
      if (routeSnapshot.activeDomain === 'chat') {
        dispatch(setShellChatSearchQuery(''));
      }
      rootTabNavigationRef.current?.dispatch(
        CommonActions.navigate({
          name: DOMAIN_TO_TAB[mode]
        })
      );
    },
    [
      chatAgentsSidebarOpen,
      chatDetailDrawerOpen,
      closeFloatingPanels,
      dispatch,
      goBackOrNavigateAgentsList,
      goBackOrNavigateChatList,
      goBackOrNavigateTerminalList,
      routeSnapshot,
      setChatPlusMenuOpen,
      setInboxOpen
    ]
  );

  return (
    <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}>
      <KeyboardAvoidingView
        style={[styles.shell, { paddingBottom: keyboardInset }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ShellTopNav
          theme={theme}
          routeModel={routeModel}
          routeSnapshot={routeSnapshot}
          chatSearchQuery={chatSearchQuery}
          chatPlusMenuOpen={chatPlusMenuOpen}
          inboxUnreadCount={inboxUnreadCount}
          onChangeChatSearchQuery={setChatSearchQuery}
          onPressChatOverlayBack={handleChatOverlayBack}
          onPressChatSearchBack={handleChatSearchBack}
          onPressAgentsBack={() => {
            goBackOrNavigateAgentsList();
          }}
          onPressChatLeftAction={() => {
            setInboxOpen(false);
            setChatPlusMenuOpen(false);
            dispatch(closeChatDetailDrawer());
            dispatch(resetChatDetailDrawerPreview());
            dispatch(setChatAgentsSidebarOpen(!chatAgentsSidebarOpen));
          }}
          onPressTerminalBack={() => {
            setInboxOpen(false);
            goBackOrNavigateTerminalList();
          }}
          onPressTerminalLeftAction={() => {
            setInboxOpen(false);
          }}
          onPressUserInboxToggle={() => {
            dispatch(setChatAgentsSidebarOpen(false));
            dispatch(closeChatDetailDrawer());
            setInboxOpen((prev) => !prev);
          }}
          onPressTerminalRefresh={() => {
            setInboxOpen(false);
            if (routeSnapshot.terminalPane === 'detail') {
              dispatch(reloadPty());
            } else {
              refreshTerminalSessions().catch(() => {});
            }
          }}
          onPressTerminalDrive={() => {
            setInboxOpen(false);
            if (routeSnapshot.terminalPane !== 'list') {
              return;
            }
            terminalNavigationRef.current?.navigate('TerminalDrive');
          }}
          onPressChatDetailMenu={() => {
            setInboxOpen(false);
            dispatch(setChatAgentsSidebarOpen(false));
            dispatch(closeChatDetailDrawer());
            dispatch(resetChatDetailDrawerPreview());
            dispatch(openChatDetailDrawer());
          }}
          onPressChatListSearch={handleChatListSearch}
          onToggleChatPlusMenu={() => setChatPlusMenuOpen((prev) => !prev)}
          onPressChatPlusMenuItem={(label) => {
            setChatPlusMenuOpen(false);
            dispatch(setStatusText(`功能建设中：${label}`));
          }}
          onPressPublishToggle={() => {
            dispatch(setChatAgentsSidebarOpen(false));
            setInboxOpen(false);
            agentsNavigationRef.current?.navigate('AgentsPublish');
          }}
          onPressThemeToggle={() => {
            dispatch(setChatAgentsSidebarOpen(false));
            setInboxOpen(false);
            dispatch(toggleTheme());
          }}
        />

        {routeSnapshot.activeDomain === 'chat' &&
        !routeSnapshot.hasChatOverlay &&
        routeSnapshot.chatMode === 'list' &&
        chatPlusMenuOpen ? (
          <Pressable
            style={styles.chatTopMenuMask}
            onPress={() => setChatPlusMenuOpen(false)}
            testID="chat-list-plus-menu-mask"
          />
        ) : null}

        <View style={styles.domainContent}>
          <Tab.Navigator
            id="RootTab"
            initialRouteName={DOMAIN_TO_TAB[activeDomain]}
            backBehavior="none"
            screenOptions={{ headerShown: false }}
            tabBar={() =>
              routeModel.showBottomNav ? (
                <View style={[styles.bottomNavWrap, { paddingBottom: Math.max(insets.bottom, 6) }]}>
                  <BottomDomainNav
                    value={routeSnapshot.activeDomain}
                    theme={theme}
                    onPressItem={handleDomainTabPress}
                  />
                </View>
              ) : null
            }
          >
            <Tab.Screen name="Chat">
              {() => (
                <ShellChatTabScreen
                  onBindRootTabNavigation={bindRootTabNavigation}
                  onDomainFocus={handleDomainFocus}
                  onBindNavigation={bindChatNavigation}
                  onRouteFocus={handleChatRouteFocus}
                  chatDetailRuntime={chatDetailRuntime}
                />
              )}
            </Tab.Screen>
            <Tab.Screen name="Terminal">
              {() => (
                <ShellTerminalTabScreen
                  onBindRootTabNavigation={bindRootTabNavigation}
                  onDomainFocus={handleDomainFocus}
                  onBindNavigation={bindTerminalNavigation}
                  onRouteFocus={handleTerminalRouteFocus}
                  runtime={terminalRuntime}
                />
              )}
            </Tab.Screen>
            <Tab.Screen name="Agents">
              {() => (
                <ShellAgentsTabScreen
                  onBindRootTabNavigation={bindRootTabNavigation}
                  onDomainFocus={handleDomainFocus}
                  onBindNavigation={bindAgentsNavigation}
                  onRouteFocus={handleAgentsRouteFocus}
                  runtime={agentsRuntime}
                />
              )}
            </Tab.Screen>
            <Tab.Screen name="User">
              {() => (
                <ShellUserTabScreen
                  onBindRootTabNavigation={bindRootTabNavigation}
                  onDomainFocus={handleDomainFocus}
                  theme={theme}
                  onSettingsApplied={() => refreshAll(true)}
                  username={authUsername}
                  deviceName={authDeviceName}
                  accessToken={authAccessToken}
                  versionLabel={appVersionLabel}
                  onLogout={handleLogout}
                />
              )}
            </Tab.Screen>
          </Tab.Navigator>
        </View>
      </KeyboardAvoidingView>

      <View pointerEvents={inboxOpen ? 'auto' : 'none'} style={styles.inboxLayer}>
        <Animated.View
          style={[
            styles.inboxModal,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              opacity: inboxAnim,
              paddingTop: insets.top + 8,
              transform: [
                {
                  translateY: inboxAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-Math.max(120, window.height * 0.16), 0]
                  })
                }
              ]
            }
          ]}
        >
          <View style={[styles.inboxModalHead, { borderBottomColor: theme.border }]}>
            <View>
              <Text style={[styles.inboxTitle, { color: theme.text }]}>消息盒子</Text>
              <Text style={[styles.inboxSubTitle, { color: theme.textMute }]}>未读 {inboxUnreadCount}</Text>
            </View>
            <View style={styles.inboxHeadActions}>
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.inboxActionBtn, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
                onPress={() => {
                  markAllInboxRead().catch(() => {});
                }}
                testID="shell-inbox-read-all-btn"
              >
                <Text style={[styles.inboxCloseText, { color: theme.textSoft }]}>全部已读</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.inboxActionBtn, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
                onPress={() => setInboxOpen(false)}
                testID="shell-inbox-close-btn"
              >
                <Text style={[styles.inboxCloseText, { color: theme.textSoft }]}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={styles.inboxModalScroll} contentContainerStyle={styles.inboxList}>
            {inboxLoading ? <Text style={[styles.inboxItemBody, { color: theme.textMute }]}>加载中...</Text> : null}
            {!inboxLoading && inboxMessages.length === 0 ? (
              <Text style={[styles.inboxItemBody, { color: theme.textMute }]}>暂无消息</Text>
            ) : null}
            {inboxMessages.map((message) => (
              <TouchableOpacity
                key={message.messageId}
                activeOpacity={0.78}
                style={[
                  styles.inboxItem,
                  {
                    borderColor: theme.border,
                    backgroundColor: message.read ? theme.surface : theme.primarySoft
                  }
                ]}
                onPress={() => {
                  if (!message.read) {
                    markInboxRead(message.messageId).catch(() => {});
                  }
                }}
              >
                <View style={styles.inboxItemTop}>
                  <Text style={[styles.inboxItemTitle, { color: theme.text }]}>{message.title}</Text>
                  <Text style={[styles.inboxItemTime, { color: theme.textMute }]}>
                    {formatInboxTime(message.createAt)}
                  </Text>
                </View>
                <Text style={[styles.inboxItemBody, { color: theme.textSoft }]}>{message.content}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      </View>

      <AgentSidebar
        visible={routeSnapshot.activeDomain === 'chat' && chatAgentsSidebarOpen}
        theme={theme}
        agents={agents}
        selectedAgentKey={selectedAgentKey}
        onClose={() => dispatch(setChatAgentsSidebarOpen(false))}
        onSelectAgent={handleSidebarSelectAgent}
      />
      <ChatDetailDrawer
        visible={
          routeSnapshot.activeDomain === 'chat' &&
          routeSnapshot.chatOverlayType === 'chatDetail' &&
          chatDetailDrawerOpen
        }
        previewProgress={
          routeSnapshot.activeDomain === 'chat' && routeSnapshot.chatOverlayType === 'chatDetail'
            ? chatDetailDrawerPreviewProgress
            : 0
        }
        interactive={
          routeSnapshot.activeDomain === 'chat' &&
          routeSnapshot.chatOverlayType === 'chatDetail' &&
          chatDetailDrawerOpen
        }
        theme={theme}
        activeAgentName={activeAgentName}
        chats={currentAgentChats}
        activeChatId={chatId}
        onClose={() => dispatch(closeChatDetailDrawer())}
        onCreateChat={handleCreateCurrentAgentChat}
        onSelectChat={(nextChatId) => {
          dispatch(setChatId(nextChatId));
          dispatch(closeChatDetailDrawer());
          const normalizedAgentKey = String(selectedAgentKey || '').trim();
          chatNavigationRef.current?.navigate('ChatDetail', {
            chatId: nextChatId,
            agentKey: normalizedAgentKey || undefined
          });
        }}
      />
    </View>
  );
}
