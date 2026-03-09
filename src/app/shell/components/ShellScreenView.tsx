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
import { CommonActions, NavigationProp, ParamListBase } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { BottomDomainNav } from '../BottomDomainNav';
import { ShellTopNav } from './ShellTopNav';
import { styles } from '../ShellScreen.styles';
import { ShellScreenController } from '../hooks/useShellScreenController';
import { buildShellHeaderDescriptor, ShellHeaderActions } from '../routes/shellHeaderModel';
import { buildShellRouteModel } from '../routes/shellRouteModel';
import { buildShellRouteSnapshot } from '../routes/shellRouteSnapshot';
import { ShellTabNavigation, ShellTabParamList } from '../types';
import { getAppByKey } from '../pages/apps/config';
import { AppsRouteName, AppsRuntimeBridge } from '../pages/apps/types';
import { ChatRootNavigation, ChatRouteName } from '../pages/chat/types';
import { TerminalRouteName, TerminalRuntimeBridge } from '../pages/terminal/types';
import { ShellAppsTabScreen } from '../pages/apps';
import { ShellChatTabScreen } from '../pages/chat';
import { ShellDriveTabScreen } from '../pages/drive';
import { ShellTerminalTabScreen } from '../pages/terminal';
import { ShellUserTabScreen } from '../pages/user';
import { hideToast, showToast } from '../../ui/uiSlice';
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
import { setChatId } from '../../../modules/chat/state/chatSlice';
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
type ShellNavigableDomain = 'chat' | 'apps' | 'terminal';
type ShellStackBinding = {
  navigation: NavigationProp<ParamListBase>;
  rootRouteName: string;
};

const DOMAIN_TO_TAB: Record<DomainMode, ShellTabName> = {
  chat: 'Chat',
  apps: 'Apps',
  terminal: 'Terminal',
  drive: 'Drive',
  user: 'User'
};

const Tab = createBottomTabNavigator<ShellTabParamList>();

function normalizeDomain(domain: DomainMode | string): DomainMode {
  if (domain === 'chat' || domain === 'apps' || domain === 'terminal' || domain === 'drive' || domain === 'user') {
    return domain;
  }
  return domain === 'agents' ? 'apps' : 'chat';
}

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
  const normalizedActiveDomain = normalizeDomain(activeDomain);

  const rootTabNavigationRef = useRef<ShellTabNavigation | null>(null);
  const stackRegistryRef = useRef<Partial<Record<ShellNavigableDomain, ShellStackBinding>>>({});
  const previousFocusedDomainRef = useRef<DomainMode>(normalizedActiveDomain);

  const [focusedDomain, setFocusedDomain] = useState<DomainMode>(normalizedActiveDomain);
  const [appsFocusedRoute, setAppsFocusedRoute] = useState<AppsRouteName>('AppsList');
  const [appsFocusedAppKey, setAppsFocusedAppKey] = useState<string>('');
  const [chatFocusedRoute, setChatFocusedRoute] = useState<ChatRouteName>('ChatList');
  const [terminalFocusedRoute, setTerminalFocusedRoute] = useState<TerminalRouteName>('TerminalList');

  const routeSnapshot = useMemo(
    () =>
      buildShellRouteSnapshot({
        activeDomain: focusedDomain,
        appsRouteName: appsFocusedRoute,
        chatRouteName: chatFocusedRoute,
        terminalRouteName: terminalFocusedRoute
      }),
    [appsFocusedRoute, chatFocusedRoute, focusedDomain, terminalFocusedRoute]
  );

  const activeAppName = useMemo(() => getAppByKey(appsFocusedAppKey)?.name || '', [appsFocusedAppKey]);

  const routeModel = useMemo(
    () =>
      buildShellRouteModel({
        routeSnapshot,
        activeAgentName,
        activeAgentRole,
        activeAppName
      }),
    [activeAgentName, activeAgentRole, activeAppName, routeSnapshot]
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

  const bindStackNavigation = useCallback(
    (domain: ShellNavigableDomain, navigation: NavigationProp<ParamListBase>, rootRouteName: string) => {
      stackRegistryRef.current[domain] = {
        navigation,
        rootRouteName
      };
    },
    []
  );

  const handleAppsRouteFocus = useCallback((routeName: AppsRouteName, appKey?: string) => {
    setAppsFocusedRoute(routeName);
    setAppsFocusedAppKey(routeName === 'AppsWebView' ? String(appKey || '').trim() : '');
  }, []);

  const handleChatRouteFocus = useCallback((routeName: ChatRouteName) => {
    setChatFocusedRoute(routeName);
  }, []);

  const handleTerminalRouteFocus = useCallback((routeName: TerminalRouteName) => {
    setTerminalFocusedRoute(routeName);
  }, []);

  const goBackWithinDomain = useCallback((domain: ShellNavigableDomain) => {
    const binding = stackRegistryRef.current[domain];
    const navigation = binding?.navigation;
    if (!navigation) return;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate(binding.rootRouteName);
  }, []);

  const resetTerminalStackToList = useCallback(() => {
    const navigation = stackRegistryRef.current.terminal?.navigation;
    if (!navigation) return;
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'TerminalList' }]
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
        goBackWithinDomain('chat');
        return true;
      }
      if (routeSnapshot.activeDomain === 'chat' && stackRegistryRef.current.chat?.navigation?.canGoBack()) {
        goBackWithinDomain('chat');
        return true;
      }
      if (routeSnapshot.activeDomain === 'terminal' && stackRegistryRef.current.terminal?.navigation?.canGoBack()) {
        goBackWithinDomain('terminal');
        return true;
      }
      if (routeSnapshot.activeDomain === 'apps' && stackRegistryRef.current.apps?.navigation?.canGoBack()) {
        goBackWithinDomain('apps');
        return true;
      }
      return false;
    });

    return () => sub.remove();
  }, [
    chatAgentsSidebarOpen,
    chatDetailDrawerOpen,
    dispatch,
    goBackWithinDomain,
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
    goBackWithinDomain('chat');
  }, [chatDetailDrawerOpen, dispatch, goBackWithinDomain, setInboxOpen]);

  const handleChatSearchBack = useCallback(() => {
    setChatPlusMenuOpen(false);
    dispatch(setShellChatSearchQuery(''));
    goBackWithinDomain('chat');
  }, [dispatch, goBackWithinDomain, setChatPlusMenuOpen]);

  const handleChatListSearch = useCallback(() => {
    setChatPlusMenuOpen(false);
    (stackRegistryRef.current.chat?.navigation as ChatRootNavigation | undefined)?.navigate('ChatSearch');
  }, [setChatPlusMenuOpen]);

  const handleSidebarSelectAgent = useCallback(
    (agentKey: string) => {
      const normalizedAgentKey = String(agentKey || '').trim();
      if (!normalizedAgentKey) {
        return;
      }
      dispatch(setUserSelectedAgentKey(normalizedAgentKey));
      dispatch(setChatId(''));
      dispatch(hideToast());
      dispatch(setChatAgentsSidebarOpen(false));
      dispatch(closeChatDetailDrawer());
      dispatch(resetChatDetailDrawerPreview());
      (stackRegistryRef.current.chat?.navigation as ChatRootNavigation | undefined)?.navigate('ChatDetail', {
        chatId: '',
        agentKey: normalizedAgentKey
      });
    },
    [dispatch]
  );

  const handleCreateCurrentAgentChat = useCallback(() => {
    dispatch(setChatId(''));
    dispatch(hideToast());
    dispatch(closeChatDetailDrawer());
    dispatch(resetChatDetailDrawerPreview());
    setChatPlusMenuOpen(false);
    const normalizedAgentKey = String(selectedAgentKey || '').trim();
    (stackRegistryRef.current.chat?.navigation as ChatRootNavigation | undefined)?.navigate('ChatDetail', {
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

  const appsRuntime = useMemo<AppsRuntimeBridge>(
    () => ({
      authAccessToken,
      authAccessExpireAtMs,
      authTokenSignal,
      onWebViewAuthRefreshRequest: handleWebViewAuthRefreshRequest
    }),
    [authAccessExpireAtMs, authAccessToken, authTokenSignal, handleWebViewAuthRefreshRequest]
  );

  const toggleChatAgentsSidebar = useCallback(() => {
    setInboxOpen(false);
    setChatPlusMenuOpen(false);
    dispatch(closeChatDetailDrawer());
    dispatch(resetChatDetailDrawerPreview());
    dispatch(setChatAgentsSidebarOpen(!chatAgentsSidebarOpen));
  }, [chatAgentsSidebarOpen, dispatch, setChatPlusMenuOpen, setInboxOpen]);

  const handleCreateApp = useCallback(() => {
    dispatch(showToast({ message: '功能建设中：新增应用', tone: 'warn' }));
  }, [dispatch]);

  const handleOpenTerminalDrive = useCallback(() => {
    setInboxOpen(false);
    if (routeSnapshot.terminalPane !== 'list') {
      return;
    }
    stackRegistryRef.current.terminal?.navigation?.navigate('TerminalDrive');
  }, [routeSnapshot.terminalPane, setInboxOpen]);

  const handleReloadTerminalDetail = useCallback(() => {
    setInboxOpen(false);
    dispatch(reloadPty());
  }, [dispatch, setInboxOpen]);

  const handleToggleInbox = useCallback(() => {
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(closeChatDetailDrawer());
    setInboxOpen((prev) => !prev);
  }, [dispatch, setInboxOpen]);

  const handleDriveMenu = useCallback(() => {
    setInboxOpen(false);
    dispatch(showToast({ message: '功能建设中：网盘菜单', tone: 'warn' }));
  }, [dispatch, setInboxOpen]);

  const handleDriveSearch = useCallback(() => {
    setInboxOpen(false);
    dispatch(showToast({ message: '功能建设中：网盘搜索', tone: 'warn' }));
  }, [dispatch, setInboxOpen]);

  const handleDriveSelect = useCallback(() => {
    setInboxOpen(false);
    dispatch(showToast({ message: '功能建设中：网盘管理', tone: 'warn' }));
  }, [dispatch, setInboxOpen]);

  const handleChatDetailMenu = useCallback(() => {
    setInboxOpen(false);
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(closeChatDetailDrawer());
    dispatch(resetChatDetailDrawerPreview());
    dispatch(openChatDetailDrawer());
  }, [dispatch, setInboxOpen]);

  const handleThemeToggle = useCallback(() => {
    dispatch(setChatAgentsSidebarOpen(false));
    setInboxOpen(false);
    dispatch(toggleTheme());
  }, [dispatch, setInboxOpen]);

  const handleSelectChatPlusMenuItem = useCallback(
    (label: string) => {
      setChatPlusMenuOpen(false);
      dispatch(showToast({ message: `功能建设中：${label}`, tone: 'warn' }));
    },
    [dispatch, setChatPlusMenuOpen]
  );

  const handleGoBackFromAppsDetail = useCallback(() => {
    setInboxOpen(false);
    goBackWithinDomain('apps');
  }, [goBackWithinDomain, setInboxOpen]);

  const handleGoBackFromTerminal = useCallback(() => {
    setInboxOpen(false);
    goBackWithinDomain('terminal');
  }, [goBackWithinDomain, setInboxOpen]);

  const handleToggleChatPlusMenu = useCallback(() => {
    setChatPlusMenuOpen((prev) => !prev);
  }, [setChatPlusMenuOpen]);

  const headerActions = useMemo<ShellHeaderActions>(
    () => ({
      toggleChatAgentsSidebar,
      goBackInChat: handleChatOverlayBack,
      goBackFromChatSearch: handleChatSearchBack,
      openChatSearch: handleChatListSearch,
      openChatDetailMenu: handleChatDetailMenu,
      toggleChatPlusMenu: handleToggleChatPlusMenu,
      selectChatPlusMenuItem: handleSelectChatPlusMenuItem,
      setChatSearchQuery,
      goBackFromAppsDetail: handleGoBackFromAppsDetail,
      createApp: handleCreateApp,
      goBackFromTerminal: handleGoBackFromTerminal,
      openTerminalDrive: handleOpenTerminalDrive,
      reloadTerminalDetail: handleReloadTerminalDetail,
      toggleInbox: handleToggleInbox,
      showDriveMenu: handleDriveMenu,
      showDriveSearch: handleDriveSearch,
      showDriveSelect: handleDriveSelect,
      toggleTheme: handleThemeToggle
    }),
    [
      handleChatDetailMenu,
      handleChatListSearch,
      handleChatOverlayBack,
      handleChatSearchBack,
      handleCreateApp,
      handleDriveMenu,
      handleDriveSearch,
      handleDriveSelect,
      handleGoBackFromAppsDetail,
      handleGoBackFromTerminal,
      handleOpenTerminalDrive,
      handleReloadTerminalDetail,
      handleSelectChatPlusMenuItem,
      handleThemeToggle,
      handleToggleChatPlusMenu,
      handleToggleInbox,
      setChatSearchQuery,
      toggleChatAgentsSidebar
    ]
  );

  const headerDescriptor = useMemo(
    () =>
      buildShellHeaderDescriptor({
        theme,
        routeSnapshot,
        chatSearchQuery,
        chatPlusMenuOpen,
        inboxUnreadCount,
        activeAgentName,
        activeAgentRole,
        activeAppName,
        actions: headerActions
      }),
    [
      activeAgentName,
      activeAgentRole,
      activeAppName,
      chatPlusMenuOpen,
      chatSearchQuery,
      headerActions,
      inboxUnreadCount,
      routeSnapshot,
      theme
    ]
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
            goBackWithinDomain('chat');
            return;
          }
          if (routeSnapshot.hasChatOverlay) {
            goBackWithinDomain('chat');
            return;
          }
          return;
        }

        if (mode === 'apps' && routeSnapshot.appsPane === 'detail') {
          goBackWithinDomain('apps');
          return;
        }

        if (mode === 'terminal' && routeSnapshot.terminalPane !== 'list') {
          goBackWithinDomain('terminal');
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
      goBackWithinDomain,
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
        <ShellTopNav descriptor={headerDescriptor} />

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
            initialRouteName={DOMAIN_TO_TAB[normalizedActiveDomain]}
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
                  onBindNavigation={(navigation) => bindStackNavigation('chat', navigation, 'ChatList')}
                  onRouteFocus={handleChatRouteFocus}
                  chatDetailRuntime={chatDetailRuntime}
                />
              )}
            </Tab.Screen>
            <Tab.Screen name="Apps">
              {() => (
                <ShellAppsTabScreen
                  onBindRootTabNavigation={bindRootTabNavigation}
                  onDomainFocus={handleDomainFocus}
                  onBindNavigation={(navigation) => bindStackNavigation('apps', navigation, 'AppsList')}
                  onRouteFocus={handleAppsRouteFocus}
                  runtime={appsRuntime}
                />
              )}
            </Tab.Screen>
            <Tab.Screen name="Terminal">
              {() => (
                <ShellTerminalTabScreen
                  onBindRootTabNavigation={bindRootTabNavigation}
                  onDomainFocus={handleDomainFocus}
                  onBindNavigation={(navigation) => bindStackNavigation('terminal', navigation, 'TerminalList')}
                  onRouteFocus={handleTerminalRouteFocus}
                  runtime={terminalRuntime}
                />
              )}
            </Tab.Screen>
            <Tab.Screen name="Drive">
              {() => (
                <ShellDriveTabScreen
                  onBindRootTabNavigation={bindRootTabNavigation}
                  onDomainFocus={handleDomainFocus}
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
          (stackRegistryRef.current.chat?.navigation as ChatRootNavigation | undefined)?.navigate('ChatDetail', {
            chatId: nextChatId,
            agentKey: normalizedAgentKey || undefined
          });
        }}
      />
    </View>
  );
}
