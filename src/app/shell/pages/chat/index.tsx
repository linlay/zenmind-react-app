import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ChatListRouteScreen } from './ListPane';
import { ChatSearchRouteScreen } from './SearchPane';
import { ChatDetailRouteScreen } from './ChatDetail';
import { AgentProfileRouteScreen } from './AgentProfile';

import { ChatDetailRuntimeBridge, ChatRootNavigation, ChatRouteName, ChatStackParamList } from './types';

import { styles } from './index.styles';

const Stack = createNativeStackNavigator<ChatStackParamList>();

export interface ChatScreenProps {
  onRouteFocus?: (routeName: ChatRouteName) => void;
  onBindNavigation?: (navigation: ChatRootNavigation) => void;
  chatDetailRuntime?: ChatDetailRuntimeBridge;
}

export function ChatScreen({ onRouteFocus, onBindNavigation, chatDetailRuntime }: ChatScreenProps) {
  return (
    <View style={styles.domainContent}>
      <Stack.Navigator id="ChatScreen" initialRouteName="ChatList" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ChatList">
          {(props) => (
            <ChatListRouteScreen {...props} onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} />
          )}
        </Stack.Screen>
        <Stack.Screen name="ChatSearch">
          {(props) => (
            <ChatSearchRouteScreen {...props} onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} />
          )}
        </Stack.Screen>
        <Stack.Screen name="ChatDetail">
          {(props) => (
            <ChatDetailRouteScreen
              {...props}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              chatDetailRuntime={chatDetailRuntime}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="AgentProfile">
          {(props) => (
            <AgentProfileRouteScreen {...props} onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </View>
  );
}
