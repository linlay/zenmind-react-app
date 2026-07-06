import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../shared/i18n';
import { formatConversationTimestamp } from '../../../shared/visual/foundation';
import { ChatConversationAwaitingState } from '../../chatRealtime/types';

const ANIMATION_DURATION = 280;
const SPRING_CONFIG = {
  damping: 18,
  stiffness: 220,
  mass: 0.9
};
const RESUME_BAR_CLASS =
  'mx-app-lg mb-1 mt-0 flex-row items-center gap-[6px] self-start rounded-app-pill bg-app-brand-blue-soft px-[10px] py-[6px] active:opacity-[0.72]';
const RESUME_ICON_CLASS = 'h-5 w-5 items-center justify-center rounded-app-pill bg-app-surface';
const RESUME_TITLE_CLASS = 'max-w-[180px] text-[12px] font-bold leading-4 text-app-brand-blue-strong';
const OVERLAY_CLASS = 'absolute inset-0 justify-end';
const MASK_CLASS = 'absolute inset-0 bg-app-overlay';
const MASK_PRESSABLE_CLASS = 'flex-1';
const SHEET_CLASS = 'gap-4 rounded-t-[24px] bg-app-surface px-5 pt-3';
const HANDLE_CLASS = 'h-[5px] w-9 self-center rounded-[3px] bg-app-line-strong';
const PANEL_HEADER_CLASS = 'flex-row items-start justify-between gap-3';
const PANEL_HEADER_TEXT_CLASS = 'flex-1 gap-1';
const PANEL_HEADER_TITLE_CLASS = 'text-[17px] font-bold text-app-primary';
const PANEL_HEADER_META_CLASS = 'text-[12px] font-semibold text-app-secondary';
const DISMISS_BUTTON_CLASS = 'rounded-[18px] bg-app-brand-blue-soft px-3 py-2 active:opacity-[0.72]';
const DISMISS_BUTTON_TEXT_CLASS = 'text-[12px] font-bold text-app-brand-blue-strong';
const PANEL_CONTENT_CLASS = 'gap-3';
const MODE_BADGE_CLASS = 'self-start rounded-app-pill bg-app-brand-blue-soft px-[10px] py-[5px]';
const MODE_BADGE_TEXT_CLASS = 'text-[11px] font-bold text-app-brand-blue-strong';
const PROMPT_TEXT_CLASS = 'text-[15px] font-bold leading-[22px] text-app-primary';
const HINT_TEXT_CLASS = 'text-[13px] leading-5 text-app-secondary';
const PAYLOAD_CARD_CLASS =
  'max-h-[180px] rounded-[16px] border border-app-line-strong bg-app-surface-muted px-[14px] py-3';
const PAYLOAD_TEXT_CLASS = 'text-[13px] leading-[19px] text-app-primary';
const ANSWER_CARD_CLASS = 'gap-2 rounded-[16px] border border-app-line-strong bg-app-surface-muted px-[14px] py-[14px]';
const ANSWER_LABEL_CLASS = 'text-[11px] font-bold text-app-secondary';
const ANSWER_TEXT_CLASS = 'text-[14px] leading-[21px] text-app-primary';

type ChatAwaitingOverlayProps = {
  awaiting: ChatConversationAwaitingState;
  onDismiss: () => void;
};

type ChatAwaitingResumeBarProps = {
  awaiting: ChatConversationAwaitingState | null;
  visible: boolean;
  onPress: () => void;
};

function getModeLabel(mode: ChatConversationAwaitingState['mode'], t: TFunction): string {
  switch (mode) {
    case 'plan':
      return t('awaiting.mode.plan');
    case 'approval':
      return t('awaiting.mode.approval');
    case 'form':
      return t('awaiting.mode.form');
    case 'question':
    default:
      return t('awaiting.mode.question');
  }
}

function getModeHint(mode: ChatConversationAwaitingState['mode'], t: TFunction): string {
  switch (mode) {
    case 'plan':
      return t('awaiting.hint.plan');
    case 'approval':
      return t('awaiting.hint.approval');
    case 'form':
      return t('awaiting.hint.form');
    case 'question':
    default:
      return t('awaiting.hint.question');
  }
}

function getModePromptTitle(mode: ChatConversationAwaitingState['mode'], t: TFunction): string {
  switch (mode) {
    case 'plan':
      return t('awaiting.plan.title');
    case 'approval':
      return t('awaiting.approval.title');
    case 'form':
      return t('awaiting.form.title');
    case 'question':
    default:
      return t('runtime.awaiting.waiting');
  }
}

export const ChatAwaitingResumeBar = memo(function ChatAwaitingResumeBar({
  awaiting,
  visible,
  onPress
}: ChatAwaitingResumeBarProps) {
  const t = useT();

  if (!awaiting || !visible) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={t('awaiting.resume.open')}
      accessibilityRole="button"
      onPress={onPress}
      className={RESUME_BAR_CLASS}
    >
      <View className={RESUME_ICON_CLASS}>
        <AppIcon usage="awaiting.resume" />
      </View>
      <Text allowFontScaling={false} numberOfLines={1} className={RESUME_TITLE_CLASS}>
        {t('awaiting.resume.title', { mode: getModeLabel(awaiting.mode, t) })}
      </Text>
    </Pressable>
  );
});

export const ChatAwaitingOverlay = memo(function ChatAwaitingOverlay({
  awaiting,
  onDismiss
}: ChatAwaitingOverlayProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const promptText = awaiting.prompt || getModePromptTitle(awaiting.mode, t);
  const maskOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    maskOpacity.setValue(0);
    sheetTranslateY.setValue(600);

    Animated.parallel([
      Animated.timing(maskOpacity, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: true
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        ...SPRING_CONFIG,
        useNativeDriver: true
      })
    ]).start();
  }, [awaiting.id, maskOpacity, sheetTranslateY]);

  return (
    <View pointerEvents="box-none" className={OVERLAY_CLASS}>
      <Animated.View className={MASK_CLASS} style={{ opacity: maskOpacity }} pointerEvents="box-only">
        <Pressable className={MASK_PRESSABLE_CLASS} onPress={onDismiss} />
      </Animated.View>

      <Animated.View
        className={SHEET_CLASS}
        style={[
          {
            paddingBottom: Math.max(insets.bottom, 18),
            transform: [{ translateY: sheetTranslateY }]
          }
        ]}
        pointerEvents="box-none"
      >
        <View className={HANDLE_CLASS} />
        <View className={PANEL_HEADER_CLASS}>
          <View className={PANEL_HEADER_TEXT_CLASS}>
            <Text allowFontScaling={false} className={PANEL_HEADER_TITLE_CLASS}>
              {t('awaiting.title')}
            </Text>
            <Text allowFontScaling={false} className={PANEL_HEADER_META_CLASS}>
              {getModeLabel(awaiting.mode, t)} · {formatConversationTimestamp(awaiting.updatedAt)}
            </Text>
          </View>
          <Pressable onPress={onDismiss} className={DISMISS_BUTTON_CLASS}>
            <Text allowFontScaling={false} className={DISMISS_BUTTON_TEXT_CLASS}>
              {t('awaiting.collapse')}
            </Text>
          </Pressable>
        </View>

        <View className={PANEL_CONTENT_CLASS}>
          <View className={MODE_BADGE_CLASS}>
            <Text allowFontScaling={false} className={MODE_BADGE_TEXT_CLASS}>
              {getModeLabel(awaiting.mode, t)}
            </Text>
          </View>
          <Text allowFontScaling={false} className={PROMPT_TEXT_CLASS}>
            {promptText}
          </Text>
          {awaiting.payloadText ? (
            <View className={PAYLOAD_CARD_CLASS}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <Text allowFontScaling={false} selectable className={PAYLOAD_TEXT_CLASS}>
                  {awaiting.payloadText}
                </Text>
              </ScrollView>
            </View>
          ) : null}
          <Text allowFontScaling={false} className={HINT_TEXT_CLASS}>
            {getModeHint(awaiting.mode, t)}
          </Text>
          {awaiting.answer ? (
            <View className={ANSWER_CARD_CLASS}>
              <Text allowFontScaling={false} className={ANSWER_LABEL_CLASS}>
                {t('awaiting.latestAnswer')}
              </Text>
              <Text allowFontScaling={false} className={ANSWER_TEXT_CLASS}>
                {awaiting.answer}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
});
