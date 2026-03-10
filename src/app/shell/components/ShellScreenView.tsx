import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
    theme,
    keyboardInset,
    chatPlusMenuOpen,
    chatSearchQuery,
    chatAgentsSidebarOpen,
    chatDetailDrawerOpen,
    chatDetailDrawerPreviewProgress,
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
    authError,
    endpointDraft,
    savedAccounts,
    activeAccountId,
    accountSwitching,
    deviceName,
    masterPassword,
    canSubmitLogin,
    currentAgentChats,
    chatId,
    agents,
    activeAgentName,
    activeAgentRole,
    chatRefreshSignal,
    appVersionLabel,
    setChatPlusMenuOpen,
    setDeviceName,
    setMasterPassword,
    setAuthError,
    setChatSearchQuery,
    setEndpointDraftText,
    submitLogin,
    switchSavedAccount,
    removeSavedAccount,
    refreshTerminalSessions,
    openTerminalCreateSessionModal,
    openTerminalDetail,
    handleTerminalWebViewUrlChange,
    handleRequestSwitchAgentChat,
    handleWebViewAuthRefreshRequest,
    markChatViewed,
    clearChatCache,
    refreshChats,
    refreshAll,
    handleLogout,
    closeFloatingPanels,
    terminalListResetSignal
  } = controller;
  const normalizedActiveDomain = normalizeDomain(activeDomain);

  const rootTabNavigationRef = useRef<ShellTabNavigation | null>(null);
  const stackRegistryRef = useRef<Partial<Record<ShellNavigableDomain, ShellStackBinding>>>({});
  const previousFocusedDomainRef = useRef<DomainMode>(normalizedActiveDomain);

  const [focusedDomain, setFocusedDomain] = useState<DomainMode>(normalizedActiveDomain);
  const [appsFocusedRoute, setAppsFocusedRoute] = useState<AppsRouteName>('AppsList');
  const [appsFocusedAppName, setAppsFocusedAppName] = useState<string>('');
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

  const activeAppName = useMemo(() => appsFocusedAppName, [appsFocusedAppName]);

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

  const handleAppsRouteFocus = useCallback((routeName: AppsRouteName, _appKey?: string, appName?: string) => {
    setAppsFocusedRoute(routeName);
    setAppsFocusedAppName(routeName === 'AppsWebView' ? String(appName || '').trim() : '');
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
    routeSnapshot.activeDomain,
    routeSnapshot.chatMode,
    setChatPlusMenuOpen
  ]);

  const handleChatOverlayBack = useCallback(() => {
    if (chatDetailDrawerOpen) {
      dispatch(closeChatDetailDrawer());
      return;
    }
    goBackWithinDomain('chat');
  }, [chatDetailDrawerOpen, dispatch, goBackWithinDomain]);

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
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(openChatDetailDrawer());
  }, [dispatch, routeSnapshot.activeDomain, routeSnapshot.chatOverlayType]);

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
    setChatPlusMenuOpen(false);
    dispatch(closeChatDetailDrawer());
    dispatch(resetChatDetailDrawerPreview());
    dispatch(setChatAgentsSidebarOpen(!chatAgentsSidebarOpen));
  }, [chatAgentsSidebarOpen, dispatch, setChatPlusMenuOpen]);

  const handleCreateApp = useCallback(() => {
    dispatch(showToast({ message: '功能建设中：新增应用', tone: 'warn' }));
  }, [dispatch]);

  const handleOpenTerminalDrive = useCallback(() => {
    if (routeSnapshot.terminalPane !== 'list') {
      return;
    }
    stackRegistryRef.current.terminal?.navigation?.navigate('TerminalDrive');
  }, [routeSnapshot.terminalPane]);

  const handleReloadTerminalDetail = useCallback(() => {
    dispatch(reloadPty());
  }, [dispatch]);

  const handleDriveMenu = useCallback(() => {
    dispatch(showToast({ message: '功能建设中：网盘菜单', tone: 'warn' }));
  }, [dispatch]);

  const handleDriveSearch = useCallback(() => {
    dispatch(showToast({ message: '功能建设中：网盘搜索', tone: 'warn' }));
  }, [dispatch]);

  const handleDriveSelect = useCallback(() => {
    dispatch(showToast({ message: '功能建设中：网盘管理', tone: 'warn' }));
  }, [dispatch]);

  const handleChatDetailMenu = useCallback(() => {
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(closeChatDetailDrawer());
    dispatch(resetChatDetailDrawerPreview());
    dispatch(openChatDetailDrawer());
  }, [dispatch]);

  const handleThemeToggle = useCallback(() => {
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(toggleTheme());
  }, [dispatch]);

  const handleSelectChatPlusMenuItem = useCallback(
    (label: string) => {
      setChatPlusMenuOpen(false);
      dispatch(showToast({ message: `功能建设中：${label}`, tone: 'warn' }));
    },
    [dispatch, setChatPlusMenuOpen]
  );

  const handleGoBackFromAppsDetail = useCallback(() => {
    goBackWithinDomain('apps');
  }, [goBackWithinDomain]);

  const handleGoBackFromTerminal = useCallback(() => {
    goBackWithinDomain('terminal');
  }, [goBackWithinDomain]);

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
      routeSnapshot,
      theme
    ]
  );

  const handleDomainTabPress = useCallback(
    (mode: DomainMode) => {
      if (mode === routeSnapshot.activeDomain) {
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
      setChatPlusMenuOpen
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
                  savedAccounts={savedAccounts}
                  activeAccountId={activeAccountId}
                  accountSwitching={accountSwitching}
                  loginEndpointDraft={endpointDraft}
                  loginDeviceName={deviceName}
                  loginMasterPassword={masterPassword}
                  loginAuthError={authError}
                  canSubmitLogin={canSubmitLogin}
                  onClearChatCache={clearChatCache}
                  onLogout={handleLogout}
                  onSwitchAccount={switchSavedAccount}
                  onRemoveAccount={removeSavedAccount}
                  onSetLoginEndpointDraft={setEndpointDraftText}
                  onSetLoginDeviceName={setDeviceName}
                  onSetLoginMasterPassword={setMasterPassword}
                  onSetLoginAuthError={setAuthError}
                  onSubmitLogin={() => submitLogin()}
                />
              )}
            </Tab.Screen>
          </Tab.Navigator>
        </View>
      </KeyboardAvoidingView>

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
