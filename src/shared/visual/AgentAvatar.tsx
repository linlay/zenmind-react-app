import { memo } from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { SvgUri } from 'react-native-svg';

import { AppIcon } from '../icons/AppIcon';
import { AgentBuiltinIcon, AgentBuiltinIconKey } from './AgentBuiltinIcon';
import {
  AGENT_ICON_NAMES,
  resolveAgentAvatarUri,
  resolveAgentBuiltinIconName,
} from './agentAvatarIcon.ts';
import type { AgentAvatarIcon, AgentAvatarKind } from './agentAvatarTypes.ts';
import { appVisualTokens, getAvatarTone } from './foundation';

export { AGENT_ICON_NAMES };

const SHELL_CLASS = 'items-center justify-center overflow-hidden';
const ICON_SHELL_CLASS = 'items-center justify-center overflow-hidden border border-app-line bg-app-surface-muted';
const REMOTE_IMAGE_CLASS = 'h-full w-full';

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
  const uri = resolveAgentAvatarUri(icon);
  const shellSizeStyle = {
    width: size,
    height: size,
    borderRadius: Math.max(appVisualTokens.radii.sm, Math.round(size * 0.28)),
  };
  const innerSize = Math.max(1, Math.round(size * 0.84));

  if (uri) {
    return (
      <View className={ICON_SHELL_CLASS} style={[shellSizeStyle, style]}>
        {uri.type === 'svg' ? <SvgUri uri={uri.uri} width={innerSize} height={innerSize} /> : null}
        {uri.type === 'image' ? (
          <Image source={{ uri: uri.uri }} resizeMode="cover" className={REMOTE_IMAGE_CLASS} />
        ) : null}
      </View>
    );
  }

  if (type === 'agent') {
    const builtinName = resolveAgentBuiltinIconName(icon?.name);
    const iconName: AgentBuiltinIconKey = builtinName || 'default';
    return (
      <View className={ICON_SHELL_CLASS} style={[shellSizeStyle, style]}>
        <AgentBuiltinIcon name={iconName} size={innerSize} />
      </View>
    );
  }

  const tone = getAvatarTone(fallbackSeed);
  if (type === 'team') {
    return (
      <View
        className={SHELL_CLASS}
        style={[
          shellSizeStyle,
          { backgroundColor: icon?.color || tone.backgroundColor },
          style,
        ]}
      >
        <AppIcon
          usage="team.avatarFallback"
          size={Math.max(18, Math.round(size * 0.52))}
          strokeWidth={2}
        />
      </View>
    );
  }

  return null;
});
