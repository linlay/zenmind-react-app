import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';

import { BottomDomainNav } from '../BottomDomainNav';
import { ShellTopNav } from './ShellTopNav';
import { styles } from '../ShellScreen.styles';
import { ShellScreenController } from '../hooks/useShellScreenController';
import { ChatScreen } from '../pages/chat';
import { ChatRootNavigation, ChatRouteName } from '../pages/chat/types';
import { SwipeBackEdge } from '../../../shared/ui/SwipeBackEdge';
import { TerminalSessionListPane } from '../../../modules/terminal/components/TerminalSessionListPane';
import { TerminalScreen } from '../../../modules/terminal/screens/TerminalScreen';
import { AgentsScreen } from '../../../modules/agents/screens/AgentsScreen';
import { UserSettingsScreen } from '../../../modules/user/screens/UserSettingsScreen';
import { AgentSidebar } from '../../../modules/chat/components/AgentSidebar';
import { ChatDetailDrawer } from '../../../modules/chat/components/ChatDetailDrawer';
import {
  closeChatDetailDrawer,
  openChatDetailDrawer,
  resetChatDetailDrawerPreview,
  setChatAgentsSidebarOpen,
  setChatDetailDrawerPreviewProgress,
  setChatSearchQuery as setShellChatSearchQuery,
  showTerminalListPane
} from '../shellSlice';
import { setStatusText, setChatId } from '../../../modules/chat/state/chatSlice';
import { setSelectedAgentKey as setUserSelectedAgentKey, toggleTheme } from '../../../modules/user/state/userSlice';
import { reloadPty } from '../../../modules/terminal/state/terminalSlice';
import { formatInboxTime } from '../../../shared/utils/format';

interface ShellScreenViewProps {
  controller: ShellScreenController;
}

const Tab = createNativeBottomTabNavigator();

export function ShellScreenView({ controller }: ShellScreenViewProps) {
  const {
    dispatch,
    insets,
    window,
    theme,
    keyboardInset,
    inboxOpen,
    publishOpen,
    chatPlusMenuOpen,
    chatSearchQuery,
    terminalPane,
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
    routeModel,
    inboxAnim,
    publishAnim,
    terminalTranslateX,
    appVersionLabel,
    setInboxOpen,
    setPublishOpen,
    setChatPlusMenuOpen,
    setChatSearchQuery,
    refreshTerminalSessions,
    openTerminalCreateSessionModal,
    openTerminalDetail,
    handleTerminalWebViewUrlChange,
    handleDomainSwitch,
    handleRequestSwitchAgentChat,
    handleWebViewAuthRefreshRequest,
    markChatViewed,
    refreshChats,
    refreshAll,
    handleLogout,
    markAllInboxRead,
    markInboxRead
  } = controller;

  const { isChatDomain, isTerminalDomain, isAgentsDomain, isUserDomain } = routeModel;
  const chatNavigationRef = useRef<ChatRootNavigation | null>(null);
  const [chatFocusedRoute, setChatFocusedRoute] = useState<ChatRouteName>('ChatList');

  useEffect(() => {
    if (!isChatDomain && chatFocusedRoute !== 'ChatList') {
      setChatFocusedRoute('ChatList');
    }
  }, [chatFocusedRoute, isChatDomain]);

  useEffect(() => {
    if (chatFocusedRoute !== 'ChatList' && chatPlusMenuOpen) {
      setChatPlusMenuOpen(false);
    }
  }, [chatFocusedRoute, chatPlusMenuOpen, setChatPlusMenuOpen]);

  useEffect(() => {
    if (chatFocusedRoute === 'ChatDetail') {
      return;
    }
    if (chatDetailDrawerOpen) {
      dispatch(closeChatDetailDrawer());
    }
    if (chatDetailDrawerPreviewProgress > 0) {
      dispatch(resetChatDetailDrawerPreview());
    }
  }, [chatDetailDrawerOpen, chatDetailDrawerPreviewProgress, chatFocusedRoute, dispatch]);

  const bindChatNavigation = useCallback((navigation: ChatRootNavigation) => {
    chatNavigationRef.current = navigation;
  }, []);

  const handleChatRouteFocus = useCallback((routeName: ChatRouteName) => {
    setChatFocusedRoute(routeName);
  }, []);

  const effectiveChatRoute: 'list' | 'search' = chatFocusedRoute === 'ChatSearch' ? 'search' : 'list';
  const effectiveHasChatOverlay = chatFocusedRoute === 'ChatDetail' || chatFocusedRoute === 'AgentProfile';
  const effectiveIsChatDetailOverlay = chatFocusedRoute === 'ChatDetail';
  const effectiveIsChatAgentOverlay = chatFocusedRoute === 'AgentProfile';
  const effectiveShowBottomNav = isChatDomain
    ? !effectiveHasChatOverlay && effectiveChatRoute !== 'search'
    : routeModel.showBottomNav;

  const effectiveRouteModel = useMemo(() => {
    if (!isChatDomain) {
      return routeModel;
    }

    const topNavTitle =
      effectiveIsChatDetailOverlay || effectiveIsChatAgentOverlay
        ? activeAgentName
        : effectiveChatRoute === 'search'
          ? '搜索'
          : '对话';

    return {
      ...routeModel,
      isChatDetailOverlay: effectiveIsChatDetailOverlay,
      isChatAgentOverlay: effectiveIsChatAgentOverlay,
      isChatListTopNav: !effectiveHasChatOverlay && effectiveChatRoute === 'list',
      showBottomNav: effectiveShowBottomNav,
      topNavTitle,
      topNavSubtitle: effectiveIsChatDetailOverlay ? activeAgentRole : ''
    };
  }, [
    activeAgentName,
    activeAgentRole,
    effectiveChatRoute,
    effectiveHasChatOverlay,
    effectiveIsChatAgentOverlay,
    effectiveIsChatDetailOverlay,
    effectiveShowBottomNav,
    isChatDomain,
    routeModel
  ]);

  const goBackOrNavigateChatList = useCallback(() => {
    const navigation = chatNavigationRef.current;
    if (!navigation) {
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('ChatList');
  }, []);

  const handleChatOverlayBack = useCallback(() => {
    setPublishOpen(false);
    setInboxOpen(false);
    if (chatDetailDrawerOpen) {
      dispatch(closeChatDetailDrawer());
      return;
    }
    goBackOrNavigateChatList();
  }, [chatDetailDrawerOpen, dispatch, goBackOrNavigateChatList, setInboxOpen, setPublishOpen]);

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
      if (!effectiveIsChatDetailOverlay || chatDetailDrawerOpen) {
        dispatch(resetChatDetailDrawerPreview());
        return;
      }
      dispatch(setChatDetailDrawerPreviewProgress(progress));
    },
    [chatDetailDrawerOpen, dispatch, effectiveIsChatDetailOverlay]
  );

  const handleGestureShowChatDetailDrawer = useCallback(() => {
    if (!effectiveIsChatDetailOverlay) {
      dispatch(resetChatDetailDrawerPreview());
      return;
    }
    setInboxOpen(false);
    setPublishOpen(false);
    dispatch(setChatAgentsSidebarOpen(false));
    dispatch(openChatDetailDrawer());
  }, [dispatch, effectiveIsChatDetailOverlay, setInboxOpen, setPublishOpen]);

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

  return (
    <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}>
      <KeyboardAvoidingView
        style={[styles.shell, { paddingBottom: keyboardInset }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ShellTopNav
          theme={theme}
          routeModel={effectiveRouteModel}
          chatRoute={effectiveChatRoute}
          chatSearchQuery={chatSearchQuery}
          hasChatOverlay={effectiveHasChatOverlay}
          terminalPane={terminalPane}
          chatPlusMenuOpen={chatPlusMenuOpen}
          inboxUnreadCount={inboxUnreadCount}
          onChangeChatSearchQuery={setChatSearchQuery}
          onPressChatOverlayBack={handleChatOverlayBack}
          onPressChatSearchBack={handleChatSearchBack}
          onPressChatLeftAction={() => {
            setPublishOpen(false);
            setInboxOpen(false);
            setChatPlusMenuOpen(false);
            dispatch(closeChatDetailDrawer());
            dispatch(resetChatDetailDrawerPreview());
            dispatch(setChatAgentsSidebarOpen(!chatAgentsSidebarOpen));
          }}
          onPressTerminalBack={() => {
            setPublishOpen(false);
            setInboxOpen(false);
            dispatch(showTerminalListPane());
          }}
          onPressTerminalLeftAction={() => {
            setPublishOpen(false);
            setInboxOpen(false);
          }}
          onPressUserInboxToggle={() => {
            setPublishOpen(false);
            dispatch(setChatAgentsSidebarOpen(false));
            dispatch(closeChatDetailDrawer());
            setInboxOpen((prev) => !prev);
          }}
          onPressTerminalRefresh={() => {
            setInboxOpen(false);
            setPublishOpen(false);
            if (terminalPane === 'detail') {
              dispatch(reloadPty());
            } else {
              refreshTerminalSessions().catch(() => {});
            }
          }}
          onPressChatDetailMenu={() => {
            setInboxOpen(false);
            setPublishOpen(false);
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
            setPublishOpen((prev) => !prev);
          }}
          onPressThemeToggle={() => {
            dispatch(setChatAgentsSidebarOpen(false));
            setPublishOpen(false);
            setInboxOpen(false);
            dispatch(toggleTheme());
          }}
        />

        {isChatDomain && !effectiveHasChatOverlay && effectiveChatRoute === 'list' && chatPlusMenuOpen ? (
          <Pressable
            style={styles.chatTopMenuMask}
            onPress={() => setChatPlusMenuOpen(false)}
            testID="chat-list-plus-menu-mask"
          />
        ) : null}

        {/* <Tab.Navigator id="RootTab" initialRouteName="Chat" screenOptions={{ headerShown: false }}>
          <Tab.Screen
            name="Chat"
            component={(props) => (
              <ChatScreen
                {...props}
                onBindNavigation={bindChatNavigation}
                onRouteFocus={handleChatRouteFocus}
                chatDetailRuntime={chatDetailRuntime}
              />
            )}
          />
          <Tab.Screen name="Terminal" component={() => {
            
          }} />
        </Tab.Navigator> */}

        <View style={styles.domainContent}>
          {isChatDomain ? (
            <View style={styles.stackViewport} testID="chat-pane-stack">
              <ChatScreen
                onBindNavigation={bindChatNavigation}
                onRouteFocus={handleChatRouteFocus}
                chatDetailRuntime={chatDetailRuntime}
              />
            </View>
          ) : null}

          {isTerminalDomain ? (
            <View style={styles.stackViewport} testID="terminal-pane-stack">
              <Animated.View
                style={[
                  styles.stackTrack,
                  {
                    width: window.width * 2,
                    transform: [{ translateX: terminalTranslateX }]
                  }
                ]}
              >
                <View style={[styles.stackPage, { width: window.width }]}>
                  <TerminalSessionListPane
                    theme={theme}
                    loading={terminalSessionsLoading}
                    error={terminalSessionsError}
                    sessions={terminalSessions}
                    activeSessionId={activeTerminalSessionId}
                    currentWebViewUrl={terminalCurrentWebViewUrl}
                    onCreateSession={openTerminalCreateSessionModal}
                    onRefresh={() => {
                      refreshTerminalSessions().catch(() => {});
                    }}
                    onSelectSession={openTerminalDetail}
                  />
                </View>
                <View style={[styles.stackPage, { width: window.width }]}>
                  <TerminalScreen
                    theme={theme}
                    authAccessToken={authAccessToken}
                    authAccessExpireAtMs={authAccessExpireAtMs}
                    authTokenSignal={authTokenSignal}
                    onUrlChange={handleTerminalWebViewUrlChange}
                    onWebViewAuthRefreshRequest={handleWebViewAuthRefreshRequest}
                  />
                </View>
              </Animated.View>
              <SwipeBackEdge enabled={terminalPane === 'detail'} onBack={() => dispatch(showTerminalListPane())} />
            </View>
          ) : null}

          {isAgentsDomain ? <AgentsScreen theme={theme} /> : null}
          {isUserDomain ? (
            <UserSettingsScreen
              theme={theme}
              onSettingsApplied={() => refreshAll(true)}
              username={authUsername}
              deviceName={authDeviceName}
              accessToken={authAccessToken}
              versionLabel={appVersionLabel}
              onLogout={handleLogout}
            />
          ) : null}
        </View>

        {effectiveShowBottomNav ? (
          <View style={[styles.bottomNavWrap, { paddingBottom: Math.max(insets.bottom, 6) }]}>
            <BottomDomainNav value={activeDomain} theme={theme} onPressItem={handleDomainSwitch} />
          </View>
        ) : null}
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

      <View pointerEvents={publishOpen ? 'auto' : 'none'} style={styles.publishLayer}>
        <Animated.View
          style={[
            styles.publishModal,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              opacity: publishAnim,
              paddingTop: insets.top + 8,
              transform: [
                {
                  translateY: publishAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [Math.max(120, window.height * 0.14), 0]
                  })
                }
              ]
            }
          ]}
        >
          <View style={[styles.publishHead, { borderBottomColor: theme.border }]}>
            <View style={styles.publishTitleWrap}>
              <Text style={[styles.publishTitle, { color: theme.text }]}>发布中心</Text>
              <Text style={[styles.publishSubTitle, { color: theme.textMute }]} numberOfLines={2}>
                {selectedAgentKey ? `当前智能体：${selectedAgentKey}` : '请先选择智能体，然后发起发布。'}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.78}
              style={[styles.publishCloseBtn, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
              onPress={() => setPublishOpen(false)}
              testID="shell-publish-close-btn"
            >
              <Text style={[styles.publishCloseText, { color: theme.textSoft }]}>关闭</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.publishScroll} contentContainerStyle={styles.publishContent}>
            <View style={[styles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}>
              <Text style={[styles.publishSectionTitle, { color: theme.text }]}>发布目标</Text>
              <View style={styles.publishChipRow}>
                {['内部频道', '变更公告页', '测试环境'].map((item) => (
                  <View
                    key={item}
                    style={[styles.publishChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  >
                    <Text style={[styles.publishChipText, { color: theme.textSoft }]}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[styles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}>
              <Text style={[styles.publishSectionTitle, { color: theme.text }]}>发布说明</Text>
              <Text style={[styles.publishSectionBody, { color: theme.textSoft }]}>
                本次发布会同步当前智能体配置、默认提示词和会话能力开关。建议先在测试环境验证 5 分钟后再推送到团队频道。
              </Text>
            </View>

            <View style={[styles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}>
              <Text style={[styles.publishSectionTitle, { color: theme.text }]}>发布清单</Text>
              <View style={styles.publishChecklist}>
                {['配置校验已通过', '变更摘要已生成', '回滚方案已就绪'].map((item) => (
                  <View key={item} style={styles.publishChecklistItem}>
                    <Text style={[styles.publishChecklistDot, { color: theme.primaryDeep }]}>•</Text>
                    <Text style={[styles.publishChecklistText, { color: theme.textSoft }]}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.publishFooter, { borderTopColor: theme.border }]}>
            <TouchableOpacity
              activeOpacity={0.76}
              style={[styles.publishGhostBtn, { backgroundColor: theme.surfaceStrong }]}
              onPress={() => setPublishOpen(false)}
            >
              <Text style={[styles.publishGhostText, { color: theme.textSoft }]}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.82}
              style={[styles.publishPrimaryBtn, { backgroundColor: theme.primary }]}
              testID="shell-publish-submit-btn"
              onPress={() => {
                setPublishOpen(false);
                dispatch(setStatusText('发布任务已创建（演示）'));
              }}
            >
              <Text style={styles.publishPrimaryText}>确认发布</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      <AgentSidebar
        visible={isChatDomain && chatAgentsSidebarOpen}
        theme={theme}
        agents={agents}
        selectedAgentKey={selectedAgentKey}
        onClose={() => dispatch(setChatAgentsSidebarOpen(false))}
        onSelectAgent={handleSidebarSelectAgent}
      />
      <ChatDetailDrawer
        visible={isChatDomain && effectiveIsChatDetailOverlay && chatDetailDrawerOpen}
        previewProgress={isChatDomain && effectiveIsChatDetailOverlay ? chatDetailDrawerPreviewProgress : 0}
        interactive={isChatDomain && effectiveIsChatDetailOverlay && chatDetailDrawerOpen}
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
