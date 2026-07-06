import { NavigatorScreenParams } from '@react-navigation/native';

import type { AgentTaskBoardStackParamList } from '../../features/agentTaskBoard/navigationTypes';
import { ChatDetailRouteParams } from '../../features/chatPersistence/types';

export type RootTabParamList = {
  Chat: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<RootTabParamList>;
  TaskBoardFlow: NavigatorScreenParams<AgentTaskBoardStackParamList>;
  ChatDetail: ChatDetailRouteParams;
  Settings: undefined;
};
