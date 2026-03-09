import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ChatListRouteScreen } from './ListPane';
import { ChatSearchRouteScreen } from './SearchPane';
import { ChatDetailRouteScreen } from './ChatDetail';
import { AgentProfileRouteScreen } from './AgentProfile';

import {
  ChatDetailRuntimeBridge,
  ChatRootNavigation,
  ChatRouteName,
  ChatStackParamList,
  ShellChatTabScreenProps
} from './types';
import { ShellTabNavigation } from '../../types';

import { styles } from './index.styles';
import { useEffect } from 'react';

const Stack = createNativeStackNavigator<ChatStackParamList>();

interface ChatScreenProps {
  onRouteFocus?: (routeName: ChatRouteName) => void;
  onBindNavigation?: (navigation: ChatRootNavigation) => void;
  chatDetailRuntime?: ChatDetailRuntimeBridge;
}

export function ChatScreen({ onRouteFocus, onBindNavigation, chatDetailRuntime }: ChatScreenProps) {
  return (
    <View style={styles.domainContent}>
      <Stack.Navigator id="ChatScreen" initialRouteName="ChatList" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ChatList" options={{ animation: 'slide_from_right' }}>
          {(props) => <ChatListRouteScreen {...props} onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} />}
        </Stack.Screen>
        <Stack.Screen name="ChatSearch" options={{ animation: 'slide_from_right' }}>
          {(props) => <ChatSearchRouteScreen {...props} onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} />}
        </Stack.Screen>
        <Stack.Screen name="ChatDetail" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <ChatDetailRouteScreen
              {...props}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              chatDetailRuntime={chatDetailRuntime}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="AgentProfile" options={{ animation: 'slide_from_right' }}>
          {(props) => <AgentProfileRouteScreen {...props} onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} />}
        </Stack.Screen>
      </Stack.Navigator>
    </View>
  );
}

export function ShellChatTabScreen({
  onBindRootTabNavigation,
  onDomainFocus,
  onBindNavigation,
  onRouteFocus,
  chatDetailRuntime
}: ShellChatTabScreenProps) {
  const navigation = useNavigation<ShellTabNavigation>();

  useEffect(() => {
    onBindRootTabNavigation(navigation);
  }, [navigation, onBindRootTabNavigation]);

  useEffect(() => {
    const notifyFocus = () => onDomainFocus?.('chat');

    if (navigation.isFocused()) {
      notifyFocus();
    }

    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onDomainFocus]);

  return (
    <View style={styles.domainContent} testID="chat-pane-stack">
      <ChatScreen onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} chatDetailRuntime={chatDetailRuntime} />
    </View>
  );
}
