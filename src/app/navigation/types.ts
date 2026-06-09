import { NavigatorScreenParams } from '@react-navigation/native';

import { ChatDetailRouteParams } from '../../features/chatPersistence/types';

export type RootTabParamList = {
  Chat: undefined;
  Terminal: undefined;
  Drive: undefined;
  Me: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<RootTabParamList>;
  ChatDetail: ChatDetailRouteParams;
  Settings: undefined;
};
