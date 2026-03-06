import { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ShellTabNavigation } from '../../types';

import { AgentsListRouteScreen } from './List';
import { AgentsPublishRouteScreen } from './Publish';
import { styles } from './index.styles';
import { AgentsRouteName, AgentsRootNavigation, AgentsRuntimeBridge, AgentsStackParamList, ShellAgentsTabScreenProps } from './types';

const Stack = createNativeStackNavigator<AgentsStackParamList>();

interface AgentsScreenProps {
  onBindNavigation?: (navigation: AgentsRootNavigation) => void;
  onRouteFocus?: (routeName: AgentsRouteName) => void;
  runtime: AgentsRuntimeBridge;
}

export function AgentsScreen({ onBindNavigation, onRouteFocus, runtime }: AgentsScreenProps) {
  return (
    <View style={styles.domainContent}>
      <Stack.Navigator id="AgentsScreen" initialRouteName="AgentsList" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AgentsList" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <AgentsListRouteScreen {...props} onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} runtime={runtime} />
          )}
        </Stack.Screen>
        <Stack.Screen name="AgentsPublish" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <AgentsPublishRouteScreen
              {...props}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              runtime={runtime}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </View>
  );
}

export function ShellAgentsTabScreen({
  onBindRootTabNavigation,
  onDomainFocus,
  onBindNavigation,
  onRouteFocus,
  runtime
}: ShellAgentsTabScreenProps) {
  const navigation = useNavigation<ShellTabNavigation>();

  useEffect(() => {
    onBindRootTabNavigation(navigation);
  }, [navigation, onBindRootTabNavigation]);

  useEffect(() => {
    const notifyFocus = () => onDomainFocus?.('agents');

    if (navigation.isFocused()) {
      notifyFocus();
    }

    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onDomainFocus]);

  return (
    <View style={styles.domainContent} testID="agents-route-stack">
      <AgentsScreen onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} runtime={runtime} />
    </View>
  );
}
