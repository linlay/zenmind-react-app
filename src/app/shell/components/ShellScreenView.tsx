import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomDomainNav } from '../BottomDomainNav';
import { ShellTopNav } from './ShellTopNav';
import { styles } from '../ShellScreen.styles';
import { ShellScreenController } from '../hooks/useShellScreenController';
import { ChatListPane } from '../../../modules/chat/components/ChatListPane';
import { ChatSearchPane } from '../../../modules/chat/components/ChatSearchPane';
import { ChatAssistantScreen } from '../../../modules/chat/screens/ChatAssistantScreen';
import { AgentProfilePane } from '../../../modules/chat/components/AgentProfilePane';
import { SwipeBackEdge } from '../../../shared/ui/SwipeBackEdge';
import { TerminalSessionListPane } from '../../../modules/terminal/components/TerminalSessionListPane';
import { TerminalScreen } from '../../../modules/terminal/screens/TerminalScreen';
import { AgentsScreen } from '../../../modules/agents/screens/AgentsScreen';
import { UserSettingsScreen } from '../../../modules/user/screens/UserSettingsScreen';
import { AgentSidebar } from '../../../modules/chat/components/AgentSidebar';
import { ChatDetailDrawer } from '../../../modules/chat/components/ChatDetailDrawer';
import {
  closeChatDetailDrawer,
  popChatOverlay,
  resetChatDetailDrawerPreview,
  setChatAgentsSidebarOpen,
  setChatSearchQuery as setShellChatSearchQuery,
  showChatSearchRoute,
  showTerminalListPane
} from '../shellSlice';
import { setStatusText, setChatId } from '../../../modules/chat/state/chatSlice';
import { setEndpointDraft, toggleTheme } from '../../../modules/user/state/userSlice';
import { reloadPty } from '../../../modules/terminal/state/terminalSlice';
import { formatInboxTime } from '../../../shared/utils/format';

interface ShellScreenViewProps {
  controller: ShellScreenController;
}

export function ShellScreenView({ controller }: ShellScreenViewProps) {
  const {
    dispatch,
    insets,
    window,
    theme,
    booting,
    authChecking,
    authReady,
    authError,
    endpointDraft,
    deviceName,
    masterPassword,
    canSubmitLogin,
    appVersionLabel,
    keyboardInset,
    inboxOpen,
    publishOpen,
    chatPlusMenuOpen,
    chatRoute,
    chatSearchQuery,
    chatOverlayStack,
    terminalPane,
    chatAgentsSidebarOpen,
    chatDetailDrawerOpen,
    chatDetailDrawerPreviewProgress,
    inboxMessages,
    inboxUnreadCount,
    inboxLoading,
    loadingChats,
    agentLatestChats,
    searchAgentResults,
    searchChatResults,
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
    activeAgent,
    activeAgentName,
    backendUrl,
    chatRefreshSignal,
    routeModel,
    hasChatOverlay,
    inboxAnim,
    publishAnim,
    terminalTranslateX,
    chatRouteTranslateX,
    chatOverlayEnterAnim,
    chatOverlayEnterTranslateX,
    setDeviceName,
    setMasterPassword,
    setInboxOpen,
    setPublishOpen,
    setChatPlusMenuOpen,
    setChatSearchQuery,
    setEndpointDraftText,
    submitLogin,
    refreshTerminalSessions,
    openTerminalCreateSessionModal,
    openTerminalDetail,
    handleTerminalWebViewUrlChange,
    handleSearchBack,
    handleDomainSwitch,
    openChatDetail,
    openAgentProfile,
    handleSearchSelectAgent,
    handleAgentSelectNewChat,
    openNewCurrentAgentChat,
    handleAgentProfileStartChat,
    handleRequestSwitchAgentChat,
    handleRequestCreateAgentChatBySwipe,
    handleRequestPreviewChatDetailDrawer,
    handleRequestShowChatDetailDrawer,
    handleWebViewAuthRefreshRequest,
    markChatViewed,
    refreshChats,
    refreshAll,
    handleLogout,
    markAllInboxRead,
    markInboxRead
  } = controller;

  const { isChatDomain, isTerminalDomain, isAgentsDomain, isUserDomain, isChatDetailOverlay, showBottomNav } =
    routeModel;

  if (booting) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safeRoot, { backgroundColor: theme.surface }]}>
        <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}>
          <View style={styles.bootWrap}>
            <View style={[styles.bootCard, { borderColor: theme.border }]}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.bootText, { color: theme.textSoft }]}>正在加载配置...</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (authChecking) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safeRoot, { backgroundColor: theme.surface }]}>
        <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}>
          <View style={styles.bootWrap}>
            <View style={[styles.bootCard, { borderColor: theme.border }]}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.bootText, { color: theme.textSoft }]}>正在验证登录状态...</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!authReady) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safeRoot, { backgroundColor: theme.surface }]}>
        <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}>
          <View style={[styles.bootWrap, { paddingHorizontal: 20 }]}>
            <View
              style={[
                styles.bootCard,
                {
                  borderColor: theme.border,
                  width: '100%',
                  maxWidth: 440,
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 10
                }
              ]}
            >
              <Text style={[styles.authTitle, { color: theme.text }]}>设备登录</Text>
              <Text style={[styles.emptyHistoryText, { color: theme.textMute, textAlign: 'left' }]}>
                请先填写后端地址，再输入主密码完成设备授权。
              </Text>

              <TextInput
                value={endpointDraft}
                onChangeText={setEndpointDraftText}
                placeholder="后端域名 / IP（如 api.example.com 或 192.168.1.8:8080）"
                placeholderTextColor={theme.textMute}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.chatSearchInput,
                  { backgroundColor: theme.surfaceStrong, color: theme.text, marginBottom: 0 }
                ]}
              />

              <TextInput
                value={deviceName}
                onChangeText={setDeviceName}
                placeholder="设备名称"
                placeholderTextColor={theme.textMute}
                style={[
                  styles.chatSearchInput,
                  { backgroundColor: theme.surfaceStrong, color: theme.text, marginBottom: 0 }
                ]}
              />
              <TextInput
                value={masterPassword}
                onChangeText={setMasterPassword}
                placeholder="主密码"
                placeholderTextColor={theme.textMute}
                secureTextEntry
                style={[
                  styles.chatSearchInput,
                  { backgroundColor: theme.surfaceStrong, color: theme.text, marginBottom: 0 }
                ]}
              />

              {authError ? (
                <Text style={[styles.emptyHistoryText, { color: theme.danger, textAlign: 'left' }]}>{authError}</Text>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.82}
                style={[
                  styles.publishPrimaryBtn,
                  styles.loginSubmitBtn,
                  {
                    backgroundColor: theme.primary,
                    borderColor: theme.primaryDeep,
                    alignSelf: 'stretch',
                    opacity: canSubmitLogin ? 1 : 0.56
                  }
                ]}
                onPress={() => {
                  submitLogin().catch(() => {});
                }}
                testID="app-login-submit-btn"
                disabled={!canSubmitLogin}
              >
                <Text style={styles.loginSubmitText}>登录设备</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text
            style={[styles.loginVersionTextBottom, { color: theme.textMute, bottom: insets.bottom + 12 }]}
            testID="login-version-label"
          >
            {appVersionLabel}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeRoot, { backgroundColor: theme.surface }]}
      nativeID="shell-root"
      testID="shell-root"
    >
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />

      <View style={[styles.gradientFill, { backgroundColor: theme.surface }]}>
        <KeyboardAvoidingView
          style={[styles.shell, { paddingBottom: keyboardInset }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <ShellTopNav
            theme={theme}
            routeModel={routeModel}
            chatRoute={chatRoute}
            chatSearchQuery={chatSearchQuery}
            hasChatOverlay={hasChatOverlay}
            terminalPane={terminalPane}
            chatPlusMenuOpen={chatPlusMenuOpen}
            inboxUnreadCount={inboxUnreadCount}
            onChangeChatSearchQuery={setChatSearchQuery}
            onPressChatOverlayBack={() => {
              setPublishOpen(false);
              setInboxOpen(false);
              if (chatDetailDrawerOpen) {
                dispatch(closeChatDetailDrawer());
                return;
              }
              dispatch(popChatOverlay());
            }}
            onPressChatSearchBack={handleSearchBack}
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
              handleRequestShowChatDetailDrawer();
            }}
            onPressChatListSearch={() => {
              setChatPlusMenuOpen(false);
              dispatch(showChatSearchRoute());
            }}
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

          {isChatDomain && !hasChatOverlay && chatRoute === 'list' && chatPlusMenuOpen ? (
            <Pressable
              style={styles.chatTopMenuMask}
              onPress={() => setChatPlusMenuOpen(false)}
              testID="chat-list-plus-menu-mask"
            />
          ) : null}

          <View style={styles.domainContent}>
            {isChatDomain ? (
              <View style={styles.stackViewport} testID="chat-pane-stack">
                <Animated.View
                  style={[
                    styles.stackTrack,
                    {
                      width: window.width * 2,
                      transform: [{ translateX: chatRouteTranslateX }]
                    }
                  ]}
                  testID="chat-route-track"
                >
                  <View
                    pointerEvents={chatRoute === 'list' ? 'auto' : 'none'}
                    style={[styles.stackPage, { width: window.width }]}
                    testID="chat-route-page-list"
                  >
                    <ChatListPane
                      theme={theme}
                      loading={loadingChats}
                      items={agentLatestChats}
                      onSelectChat={openChatDetail}
                      onSelectAgentProfile={openAgentProfile}
                    />
                  </View>
                  <View
                    pointerEvents={chatRoute === 'search' ? 'auto' : 'none'}
                    style={[styles.stackPage, { width: window.width }]}
                    testID="chat-route-page-search"
                  >
                    <ChatSearchPane
                      theme={theme}
                      keyword={chatSearchQuery}
                      agentResults={searchAgentResults}
                      chatResults={searchChatResults}
                      onSelectRecentKeyword={(keyword) => dispatch(setShellChatSearchQuery(keyword))}
                      onSelectAgent={handleSearchSelectAgent}
                      onSelectChat={openChatDetail}
                    />
                  </View>
                </Animated.View>
                {chatOverlayStack.map((overlay, index) => {
                  const isTop = index === chatOverlayStack.length - 1;
                  return (
                    <Animated.View
                      key={overlay.overlayId}
                      pointerEvents={isTop ? 'auto' : 'none'}
                      style={[
                        styles.chatOverlayPage,
                        { zIndex: 10 + index, backgroundColor: theme.surface },
                        isTop
                          ? {
                              opacity: chatOverlayEnterAnim,
                              transform: [{ translateX: chatOverlayEnterTranslateX }]
                            }
                          : null
                      ]}
                    >
                      {overlay.type === 'chatDetail' ? (
                        <ChatAssistantScreen
                          theme={theme}
                          backendUrl={backendUrl}
                          contentWidth={window.width}
                          onRefreshChats={refreshChats}
                          keyboardHeight={keyboardInset}
                          refreshSignal={chatRefreshSignal}
                          authAccessToken={authAccessToken}
                          authAccessExpireAtMs={authAccessExpireAtMs}
                          authTokenSignal={authTokenSignal}
                          onWebViewAuthRefreshRequest={handleWebViewAuthRefreshRequest}
                          onChatViewed={markChatViewed}
                          onRequestSwitchAgentChat={handleRequestSwitchAgentChat}
                          onRequestCreateAgentChatBySwipe={handleRequestCreateAgentChatBySwipe}
                          onRequestPreviewChatDetailDrawer={handleRequestPreviewChatDetailDrawer}
                          onRequestShowChatDetailDrawer={handleRequestShowChatDetailDrawer}
                          chatDetailDrawerOpen={chatDetailDrawerOpen}
                        />
                      ) : (
                        <AgentProfilePane theme={theme} agent={activeAgent} onStartChat={handleAgentProfileStartChat} />
                      )}
                    </Animated.View>
                  );
                })}
                <SwipeBackEdge
                  enabled={hasChatOverlay && !chatDetailDrawerOpen && !chatAgentsSidebarOpen}
                  onBack={() => dispatch(popChatOverlay())}
                />
                {!hasChatOverlay && chatRoute === 'search' ? <SwipeBackEdge enabled onBack={handleSearchBack} /> : null}
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

          {showBottomNav ? (
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
              <View
                style={[styles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
              >
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

              <View
                style={[styles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
              >
                <Text style={[styles.publishSectionTitle, { color: theme.text }]}>发布说明</Text>
                <Text style={[styles.publishSectionBody, { color: theme.textSoft }]}>
                  本次发布会同步当前智能体配置、默认提示词和会话能力开关。建议先在测试环境验证 5
                  分钟后再推送到团队频道。
                </Text>
              </View>

              <View
                style={[styles.publishSection, { borderColor: theme.border, backgroundColor: theme.surfaceStrong }]}
              >
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
          onSelectAgent={handleAgentSelectNewChat}
        />
        <ChatDetailDrawer
          visible={isChatDomain && isChatDetailOverlay && chatDetailDrawerOpen}
          previewProgress={isChatDomain && isChatDetailOverlay ? chatDetailDrawerPreviewProgress : 0}
          interactive={isChatDomain && isChatDetailOverlay && chatDetailDrawerOpen}
          theme={theme}
          activeAgentName={activeAgentName}
          chats={currentAgentChats}
          activeChatId={chatId}
          onClose={() => dispatch(closeChatDetailDrawer())}
          onCreateChat={openNewCurrentAgentChat}
          onSelectChat={(nextChatId) => {
            dispatch(setChatId(nextChatId));
            dispatch(closeChatDetailDrawer());
          }}
        />
      </View>
    </SafeAreaView>
  );
}
