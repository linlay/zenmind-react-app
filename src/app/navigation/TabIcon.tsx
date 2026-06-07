import { memo } from 'react';

import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { RootTabParamList } from './types';

type AppTabIconProps = {
  routeName: keyof RootTabParamList;
  color: string;
};

const TAB_ICON_USAGES: Record<keyof RootTabParamList, AppIconUsage> = {
  Chat: 'tab.chat',
  Terminal: 'tab.terminal',
  Drive: 'tab.drive',
  Me: 'tab.me',
};

export const TAB_LABELS: Record<keyof RootTabParamList, string> = {
  Chat: '对话',
  Terminal: '任务',
  Drive: '网盘',
  Me: '用户',
};

export const AppTabIcon = memo(function AppTabIcon({ routeName, color }: AppTabIconProps) {
  return <AppIcon usage={TAB_ICON_USAGES[routeName]} color={color} />;
});
