import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { AgentWonderSuggestion } from '../../../core/api/services/chatApi';
import { AppIconButton } from '../../../shared/icons/AppIconButton';
import { useT } from '../../../shared/i18n';
import { cn } from '../../../shared/visual/className';
import { CHAT_WONDER_VISIBLE_COUNT, pickChatWonderSuggestions } from './chatWonderDisplay';

type ChatNewConversationIntroProps = {
  agentName: string;
  description?: string;
  wonders: readonly AgentWonderSuggestion[];
  onSelectWonder: (text: string) => void;
};

type WonderCardProps = {
  wonder: AgentWonderSuggestion;
  label: string;
  onPress: (text: string) => void;
};

const ROOT_CLASS = 'w-full max-w-[420px] self-center gap-app-xl px-app-sm';
const HEADING_CLASS = 'items-center gap-app-sm';
const TITLE_CLASS = 'text-center text-app-title-lg font-bold text-app-primary';
const DESCRIPTION_CLASS = 'text-center text-[14px] leading-[21px] text-app-secondary';
const WONDERS_CLASS = 'gap-app-sm';
const WONDERS_HEADER_CLASS = 'min-h-8 flex-row items-center justify-between gap-app-sm';
const WONDERS_TITLE_CLASS = 'text-app-footnote font-bold text-app-action';
const WONDER_LIST_CLASS = 'gap-app-sm';
const WONDER_CARD_CLASS =
  'min-h-[82px] w-full justify-start gap-app-xs overflow-hidden rounded-app-sm border border-app-line bg-app-surface px-app-md py-app-sm active:border-app-brand-blue active:bg-app-brand-blue-soft';
const WONDER_LABEL_CLASS = 'text-app-micro font-bold text-app-brand-blue';
const WONDER_TEXT_CLASS = 'text-app-footnote font-semibold text-app-primary';
const REFRESH_BUTTON_CLASS =
  'h-8 w-8 items-center justify-center rounded-app-pill bg-app-surface-muted active:bg-app-brand-blue-soft';
const REFRESH_BUTTON_DISABLED_CLASS = 'opacity-[0.38]';

const WonderCard = memo(function WonderCard({ wonder, label, onPress }: WonderCardProps) {
  const handlePress = useCallback(() => {
    onPress(wonder.text);
  }, [onPress, wonder.text]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      className={WONDER_CARD_CLASS}
    >
      <Text allowFontScaling={false} numberOfLines={1} className={WONDER_LABEL_CLASS}>
        {label}
      </Text>
      <Text allowFontScaling={false} ellipsizeMode="tail" numberOfLines={2} className={WONDER_TEXT_CLASS}>
        {wonder.text}
      </Text>
    </Pressable>
  );
});

export const ChatNewConversationIntro = memo(function ChatNewConversationIntro({
  agentName,
  description = '',
  wonders,
  onSelectWonder,
}: ChatNewConversationIntroProps) {
  const t = useT();
  const [refreshSeed, setRefreshSeed] = useState(0);
  const visibleWonders = useMemo(
    () => pickChatWonderSuggestions(wonders, refreshSeed),
    [refreshSeed, wonders]
  );
  const canRefreshWonders = wonders.length > CHAT_WONDER_VISIBLE_COUNT;
  const handleRefreshWonders = useCallback(() => {
    if (!canRefreshWonders) {
      return;
    }
    setRefreshSeed((current) => current + 1);
  }, [canRefreshWonders]);

  return (
    <View className={ROOT_CLASS}>
      <View className={HEADING_CLASS}>
        <Text allowFontScaling={false} numberOfLines={2} className={TITLE_CLASS}>
          {t('chatDetail.newConversation.title', { agentName })}
        </Text>
        {description ? (
          <Text allowFontScaling={false} numberOfLines={3} className={DESCRIPTION_CLASS}>
            {description}
          </Text>
        ) : null}
      </View>

      {visibleWonders.length > 0 ? (
        <View className={WONDERS_CLASS}>
          <View className={WONDERS_HEADER_CLASS}>
            <Text allowFontScaling={false} className={WONDERS_TITLE_CLASS}>
              {t('chatDetail.wonders.title')}
            </Text>
            <AppIconButton
              usage="chatDetail.wondersRefresh"
              accessibilityLabel={t('chatDetail.wonders.refresh')}
              disabled={!canRefreshWonders}
              hitSlop={8}
              onPress={handleRefreshWonders}
              size={16}
              className={cn(REFRESH_BUTTON_CLASS, !canRefreshWonders && REFRESH_BUTTON_DISABLED_CLASS)}
            />
          </View>
          <View className={WONDER_LIST_CLASS}>
            {visibleWonders.map((wonder, index) => (
              <WonderCard
                key={`${wonder.id}:${index}`}
                wonder={wonder}
                label={
                  wonder.title !== wonder.text
                    ? wonder.title
                    : t('chatDetail.wonders.cardLabel', { index: index + 1 })
                }
                onPress={onSelectWonder}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
});
