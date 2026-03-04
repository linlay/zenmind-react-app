import { ShellScreenView } from './components/ShellScreenView';
import { useShellScreenController } from './hooks/useShellScreenController';

import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

export function ShellScreen() {
  const controller = useShellScreenController();
  return <ShellScreenView controller={controller} />;
}

const Tab = createBottomTabNavigator();

function Tabs() {
  return (
    <Tab.Navigator id="RootTab">
      <Tab.Screen name="Chat" component={HomeScreen} />
      <Tab.Screen name="Terminal" component={ProfileScreen} />
      <Tab.Screen name="Agents" component={ProfileScreen} />
      <Tab.Screen name="User" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tabs />
    </NavigationContainer>
  );
}
