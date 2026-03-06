import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ShellScreenController } from './hooks/useShellScreenController';
import { DomainMode } from '../../core/types/common';

export type ShellTabParamList = {
  Chat: undefined;
  Terminal: undefined;
  Agents: undefined;
  User: undefined;
};

export type ShellTabNavigation = BottomTabNavigationProp<ShellTabParamList>;

export interface ShellTabBindings {
  onBindRootTabNavigation: (navigation: ShellTabNavigation) => void;
  onDomainFocus?: (domain: DomainMode) => void;
}

export interface ShellThemeTabScreenProps extends ShellTabBindings {
  theme: ShellScreenController['theme'];
}
