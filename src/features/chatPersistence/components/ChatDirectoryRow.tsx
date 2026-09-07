import { memo, useCallback, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { AgentAvatar } from '../../../shared/visual/AgentAvatar';
import { cn } from '../../../shared/visual/className';
import { formatConversationTimestamp, formatUnreadCount } from '../../../shared/visual/foundation';
import { appHairlineStyles } from '../../../shared/visual/hairline';
import type { ChatDirectoryItem } from '../types';

export const CHAT_DIRECTORY_ROW_HEIGHT = 84;

const CHAT_ROW_PRESSABLE_CLASS = 'flex-1 active:opacity-[0.72]';
const CHAT_ROW_CLASS = 'flex-1 flex-row items-center gap-app-md bg-app-surface pl-app-xl';
const CHAT_ROW_MENU_TARGET_CLASS = 'bg-app-background-muted';
const CHAT_ROW_DISABLED_CLASS = 'opacity-[0.74]';
const CHAT_ROW_BODY_CLASS =
  'min-w-0 flex-1 self-stretch flex-row items-center gap-app-md border-app-line py-[10px] pr-app-xl';
const CHAT_ROW_MAIN_CLASS = 'min-w-0 flex-1 gap-app-xs';
const CHAT_TITLE_ROW_CLASS = 'min-w-0 flex-row items-center gap-[6px]';
const CHAT_SOURCE_ICON_CLASS =
  'h-[20px] w-[20px] shrink-0 items-center justify-center rounded-app-pill bg-app-surface-muted';
const CHAT_TITLE_CLASS = 'shrink text-app-body-lg font-medium text-app-primary';
const CHAT_SUMMARY_CLASS = 'text-app-footnote text-app-tertiary';
const CHAT_ROW_META_CLASS = 'min-h-[46px] min-w-[74px] items-end justify-between gap-app-xs';
const CHAT_ROW_META_BOTTOM_CLASS = 'min-h-[26px] flex-row items-center justify-end gap-[6px]';
const CHAT_TIME_CLASS = 'text-[12px] font-normal leading-[14px] text-app-tertiary';
const UNREAD_BADGE_CLASS = 'h-[26px] min-w-[26px] items-center justify-center rounded-app-pill bg-app-badge px-[6px]';
const UNREAD_BADGE_TEXT_CLASS = 'text-[11px] font-bold text-app-on-action';
const UNREAD_BADGE_PLACEHOLDER_CLASS = 'h-[26px] w-[26px]';
const PINNED_MARKER_CLASS = 'h-6 w-6 items-center justify-center';

export type ChatDirectoryRowActionAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChatDirectoryDisplayItem = ChatDirectoryItem & {
  lastMessagePreview: string;
  lastMessageTimeLabel: string;
  unreadLabel: string;
};

export function createChatDirectoryDisplayItem(
  item: ChatDirectoryItem,
  noConversationLabel: string
): ChatDirectoryDisplayItem {
  return {
    ...item,
    lastMessagePreview: item.lastMessageText || noConversationLabel,
    lastMessageTimeLabel: formatConversationTimestamp(item.lastMessageAt),
    unreadLabel: item.unreadCount > 0 ? formatUnreadCount(item.unreadCount) : ''
  };
}

export const ChatDirectoryRow = memo(function ChatDirectoryRow({
  item,
  onPress,
  onLongPress,
  isMenuTarget = false,
  disabled = false
}: {
  item: ChatDirectoryDisplayItem;
  onPress: (item: ChatDirectoryItem) => void;
  onLongPress?: (item: ChatDirectoryItem, anchor: ChatDirectoryRowActionAnchor) => void;
  isMenuTarget?: boolean;
  disabled?: boolean;
}) {
  const rowRef = useRef<View>(null);
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);
  const handleLongPress = useCallback(() => {
    if (!onLongPress) {
      return;
    }

    rowRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress(item, { x, y, width, height });
    });
  }, [item, onLongPress]);

  return (
    <Pressable
      ref={rowRef}
      accessibilityRole="button"
      disabled={disabled}
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      className={CHAT_ROW_PRESSABLE_CLASS}
    >
      <View
        className={cn(
          CHAT_ROW_CLASS,
          isMenuTarget ? CHAT_ROW_MENU_TARGET_CLASS : null,
          disabled ? CHAT_ROW_DISABLED_CLASS : null
        )}
      >
        <AgentAvatar type={item.kind} icon={item.icon} fallbackSeed={item.agentKey || item.teamId || item.title} />

        <View className={CHAT_ROW_BODY_CLASS} style={appHairlineStyles.borderBottom}>
          <View className={CHAT_ROW_MAIN_CLASS}>
            <View className={CHAT_TITLE_ROW_CLASS}>
              <View className={CHAT_SOURCE_ICON_CLASS}>
                <AppIcon
                  usage={item.source.kind === 'default' ? 'chatHome.sourceDefault' : 'chatHome.sourcePaired'}
                  size={13}
                />
              </View>
              <Text numberOfLines={1} className={CHAT_TITLE_CLASS}>
                {item.title}
              </Text>
            </View>
            <Text numberOfLines={1} className={CHAT_SUMMARY_CLASS}>
              {item.lastMessagePreview}
            </Text>
          </View>

          <View className={CHAT_ROW_META_CLASS}>
            <Text numberOfLines={1} className={CHAT_TIME_CLASS}>
              {item.lastMessageTimeLabel}
            </Text>
            <View className={CHAT_ROW_META_BOTTOM_CLASS}>
              {item.unreadCount > 0 ? (
                <View className={UNREAD_BADGE_CLASS}>
                  <Text numberOfLines={1} className={UNREAD_BADGE_TEXT_CLASS}>
                    {item.unreadLabel}
                  </Text>
                </View>
              ) : null}
              {item.pinnedAt > 0 ? (
                <View className={PINNED_MARKER_CLASS}>
                  <AppIcon usage="chatHome.rowPinned" />
                </View>
              ) : null}
              {item.unreadCount <= 0 && item.pinnedAt <= 0 ? <View className={UNREAD_BADGE_PLACEHOLDER_CLASS} /> : null}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
});
