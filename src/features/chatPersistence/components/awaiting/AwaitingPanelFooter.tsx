import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { type TFunction, useT } from '../../../../shared/i18n';
import { useAppTheme } from '../../../../shared/visual/AppThemeProvider';
import { cn } from '../../../../shared/visual/className';
import type { ChatConversationAwaitingState } from '../../../chatRealtime/types';
import {
  getAwaitingCountdownRemainingSeconds,
  resolveAwaitingCountdownDeadline,
} from './awaitingQuestionState';

type AwaitingPanelFooterProps = {
  awaiting: ChatConversationAwaitingState;
  disabled: boolean;
  errorText: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  submitting: boolean;
  timeoutMs: number | null;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

const COUNTDOWN_TICK_MS = 1000;
const FOOTER_CLASS = 'min-h-9 flex-row items-center justify-between gap-app-md';
const FOOTER_STATUS_CLASS = 'min-w-0 flex-1 gap-[2px]';
const COUNTDOWN_CLASS = 'max-w-[128px] text-[12px] font-bold leading-4 text-app-secondary';
const ACTIONS_CLASS = 'flex-row items-center gap-app-sm';
const SKIP_BUTTON_CLASS =
  'min-h-[34px] min-w-[62px] items-center justify-center rounded-app-md bg-app-surface-muted px-app-md active:opacity-[0.72]';
const SKIP_TEXT_CLASS = 'text-[13px] font-extrabold leading-[18px] text-app-secondary';
const PRIMARY_BUTTON_CLASS =
  'min-h-[34px] min-w-[72px] items-center justify-center rounded-app-md bg-app-brand-blue px-app-md active:bg-app-brand-blue-strong';
const PRIMARY_TEXT_CLASS = 'text-[13px] font-black leading-[18px] text-app-on-action';
const ERROR_TEXT_CLASS = 'text-[12px] font-bold leading-4 text-app-danger';
const DISABLED_BUTTON_CLASS = 'opacity-[0.38]';

type CountdownState = {
  deadline: number | null;
  remainingSeconds: number | null;
};

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getCountdownLabel(remainingSeconds: number | null, t: TFunction): string {
  if (remainingSeconds === null) {
    return '';
  }
  return remainingSeconds > 0
    ? t('awaiting.countdown', { duration: formatDuration(remainingSeconds) })
    : t('awaiting.countdownZero');
}

function useCountdownLabel({
  awaitingId,
  createdAt,
  id,
  timeoutMs,
}: {
  awaitingId: string;
  createdAt: number;
  id: string;
  timeoutMs: number | null;
}): string {
  const t = useT();
  const countdownKey = `${id}\u001f${awaitingId}\u001f${createdAt}\u001f${timeoutMs ?? ''}`;
  const displayedAtRef = useRef<{ key: string; value: number } | null>(null);
  if (displayedAtRef.current?.key !== countdownKey) {
    displayedAtRef.current = { key: countdownKey, value: Date.now() };
  }
  const displayedAt = displayedAtRef.current.value;
  const deadline = useMemo(
    () =>
      resolveAwaitingCountdownDeadline({
        createdAt,
        timeout: timeoutMs,
        displayedAt,
      }),
    [createdAt, displayedAt, timeoutMs]
  );
  const [countdownState, setCountdownState] = useState<CountdownState>(() => ({
    deadline,
    remainingSeconds: getAwaitingCountdownRemainingSeconds(deadline, Date.now()),
  }));
  const remainingSeconds =
    countdownState.deadline === deadline
      ? countdownState.remainingSeconds
      : getAwaitingCountdownRemainingSeconds(deadline, Date.now());

  useEffect(() => {
    if (deadline === null) {
      setCountdownState((current) =>
        current.deadline === null && current.remainingSeconds === null
          ? current
          : { deadline: null, remainingSeconds: null }
      );
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    const tick = () => {
      const nextRemainingSeconds = getAwaitingCountdownRemainingSeconds(deadline, Date.now());
      setCountdownState((current) =>
        current.deadline === deadline && current.remainingSeconds === nextRemainingSeconds
          ? current
          : { deadline, remainingSeconds: nextRemainingSeconds }
      );
      if (!disposed && nextRemainingSeconds !== null && nextRemainingSeconds > 0) {
        timer = setTimeout(tick, COUNTDOWN_TICK_MS);
      }
    };

    tick();
    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [deadline]);

  return getCountdownLabel(remainingSeconds, t);
}

const AwaitingCountdownText = memo(function AwaitingCountdownText({
  awaitingId,
  createdAt,
  id,
  timeoutMs,
}: {
  awaitingId: string;
  createdAt: number;
  id: string;
  timeoutMs: number | null;
}) {
  const countdownLabel = useCountdownLabel({ awaitingId, createdAt, id, timeoutMs });
  if (!countdownLabel) {
    return null;
  }

  return (
    <Text allowFontScaling={false} numberOfLines={1} className={COUNTDOWN_CLASS}>
      {countdownLabel}
    </Text>
  );
});

export const AwaitingPanelFooter = memo(function AwaitingPanelFooter({
  awaiting,
  disabled,
  errorText,
  primaryLabel,
  secondaryLabel,
  submitting,
  timeoutMs,
  onPrimary,
  onSecondary,
}: AwaitingPanelFooterProps) {
  const { theme } = useAppTheme();
  const actionDisabled = disabled || submitting;
  const hasPrimaryAction = Boolean(primaryLabel && onPrimary);

  return (
    <View className={FOOTER_CLASS}>
      <View className={FOOTER_STATUS_CLASS}>
        {errorText ? (
          <Text allowFontScaling={false} numberOfLines={1} className={ERROR_TEXT_CLASS}>
            {errorText}
          </Text>
        ) : null}
        <AwaitingCountdownText
          awaitingId={awaiting.awaitingId}
          createdAt={awaiting.createdAt}
          id={awaiting.id}
          timeoutMs={timeoutMs}
        />
      </View>
      <View className={ACTIONS_CLASS}>
        {secondaryLabel && onSecondary ? (
          <Pressable
            accessibilityLabel={secondaryLabel}
            accessibilityRole="button"
            disabled={actionDisabled}
            onPress={onSecondary}
            className={cn(SKIP_BUTTON_CLASS, actionDisabled ? DISABLED_BUTTON_CLASS : null)}
          >
            <Text allowFontScaling={false} className={SKIP_TEXT_CLASS}>
              {secondaryLabel}
            </Text>
          </Pressable>
        ) : null}
        {hasPrimaryAction ? (
          <Pressable
            accessibilityLabel={primaryLabel}
            accessibilityRole="button"
            disabled={actionDisabled}
            onPress={onPrimary}
            className={cn(PRIMARY_BUTTON_CLASS, disabled && !submitting ? DISABLED_BUTTON_CLASS : null)}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={theme.colors.onBrandBlueAction} />
            ) : (
              <Text allowFontScaling={false} className={PRIMARY_TEXT_CLASS}>
                {primaryLabel}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});
