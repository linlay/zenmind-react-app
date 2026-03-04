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
  View,
  useWindowDimensions
} from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { styles } from './index.styles';
import { ChatAssistantScreen } from '../../../../modules/chat/screens/ChatAssistantScreen';
import { ChatListPane } from '../../../../modules/chat/components/ChatListPane';
import { ChatSearchPane } from '../../../../modules/chat/components/ChatSearchPane';

const Stack = createNativeStackNavigator();

export function ChatStack() {
  return (
    <Stack.Navigator id="ChatStack">
      <Stack.Screen name="Home" component={ChatListPane} />
      <Stack.Screen name="Profile" component={ChatSearchPane} />
    </Stack.Navigator>
  );
}

export function ChatScreen() {
  const window = useWindowDimensions();

  return (
    <View style={styles.domainContent}>
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
    </View>
  );
}
