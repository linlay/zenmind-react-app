import { memo } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SvgUri } from 'react-native-svg';

import { AppIcon } from '../icons/AppIcon';
import { AgentBuiltinIcon, AgentBuiltinIconKey } from './AgentBuiltinIcon';
import {
  AGENT_ICON_NAMES,
  resolveAgentAvatarUri,
  resolveAgentBuiltinIconName,
} from './agentAvatarIcon.ts';
import type { AgentAvatarIcon, AgentAvatarKind } from './agentAvatarTypes.ts';
import { useAppTheme, useAppThemeStyles } from './AppThemeProvider';
import { appVisualTokens, getAvatarTone, type AppThemeTokens } from './foundation';

export { AGENT_ICON_NAMES };

export type AgentAvatarProps = {
  icon?: AgentAvatarIcon | null;
  type: AgentAvatarKind;
  fallbackSeed: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export const AgentAvatar = memo(function AgentAvatar({
  icon,
  type,
  fallbackSeed,
  size = 46,
  style,
}: AgentAvatarProps) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const uri = resolveAgentAvatarUri(icon);
  const shellSizeStyle = {
    width: size,
    height: size,
    borderRadius: Math.max(appVisualTokens.radii.sm, Math.round(size * 0.28)),
  };
  const innerSize = Math.max(1, Math.round(size * 0.84));

  if (uri) {
    return (
      <View style={[styles.shell, styles.iconShell, shellSizeStyle, style]}>
        {uri.type === 'svg' ? <SvgUri uri={uri.uri} width={innerSize} height={innerSize} /> : null}
        {uri.type === 'image' ? (
          <Image source={{ uri: uri.uri }} resizeMode="cover" style={styles.remoteImage} />
        ) : null}
      </View>
    );
  }

  if (type === 'agent') {
    const builtinName = resolveAgentBuiltinIconName(icon?.name);
    const iconName: AgentBuiltinIconKey = builtinName || 'default';
    return (
      <View style={[styles.shell, styles.iconShell, shellSizeStyle, style]}>
        <AgentBuiltinIcon name={iconName} size={innerSize} />
      </View>
    );
  }

  const tone = getAvatarTone(fallbackSeed);
  if (type === 'team') {
    return (
      <View
        style={[
          styles.shell,
          shellSizeStyle,
          { backgroundColor: icon?.color || tone.backgroundColor },
          style,
        ]}
      >
        <AppIcon
          usage="team.avatarFallback"
          color={theme.colors.surface}
          size={Math.max(18, Math.round(size * 0.52))}
          strokeWidth={2}
        />
      </View>
    );
  }

  return null;
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    shell: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    iconShell: {
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.line,
    },
    remoteImage: {
      width: '100%',
      height: '100%',
    },
  });
}
