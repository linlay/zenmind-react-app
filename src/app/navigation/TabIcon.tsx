import { memo } from 'react';

import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import type { I18nKey } from '../../shared/i18n';
import { RootTabParamList } from './types';

type AppTabIconProps = {
  routeName: keyof RootTabParamList;
  color: string;
};

const TAB_ICON_USAGES: Record<keyof RootTabParamList, AppIconUsage> = {
  Chat: 'tab.chat',
  WebApps: 'tab.webApps',
  Me: 'tab.me'
};

export const TAB_LABEL_KEYS: Record<keyof RootTabParamList, I18nKey> = {
  Chat: 'tabs.chat',
  WebApps: 'tabs.webApps',
  Me: 'tabs.me'
};

export const AppTabIcon = memo(function AppTabIcon({ routeName, color }: AppTabIconProps) {
  return <AppIcon usage={TAB_ICON_USAGES[routeName]} color={color} />;
});
