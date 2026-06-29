import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
  AgentTaskBoardAssignTaskScreen,
  AgentTaskBoardNewTaskScreen,
  AgentTaskBoardTaskDetailScreen
} from './AgentTaskBoardScreen';
import type { AgentTaskBoardStackParamList } from './navigationTypes';

const TaskBoardStack = createNativeStackNavigator<AgentTaskBoardStackParamList>();

export function AgentTaskBoardFlowNavigator() {
  return (
    <TaskBoardStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 100,
        freezeOnBlur: true,
        gestureEnabled: true
      }}
    >
      <TaskBoardStack.Screen name="NewTask" component={AgentTaskBoardNewTaskScreen} />
      <TaskBoardStack.Screen name="AssignTask" component={AgentTaskBoardAssignTaskScreen} />
      <TaskBoardStack.Screen name="TaskDetail" component={AgentTaskBoardTaskDetailScreen} />
    </TaskBoardStack.Navigator>
  );
}
