import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type TFunction, useT } from '../../../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../../shared/visual/foundation';
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
  const styles = useAppThemeStyles(createStyles);
  const countdownLabel = useCountdownLabel({ awaitingId, createdAt, id, timeoutMs });
  if (!countdownLabel) {
    return null;
  }

  return (
    <Text allowFontScaling={false} numberOfLines={1} style={styles.countdown}>
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
  const styles = useAppThemeStyles(createStyles);
  const actionDisabled = disabled || submitting;
  const hasPrimaryAction = Boolean(primaryLabel && onPrimary);

  return (
    <View style={styles.footer}>
      <View style={styles.footerStatus}>
        {errorText ? (
          <Text allowFontScaling={false} numberOfLines={1} style={styles.errorText}>
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
      <View style={styles.actions}>
        {secondaryLabel && onSecondary ? (
          <Pressable
            accessibilityLabel={secondaryLabel}
            accessibilityRole="button"
            disabled={actionDisabled}
            onPress={onSecondary}
            style={({ pressed }) => [
              styles.skipButton,
              actionDisabled && styles.disabledButton,
              pressed && !actionDisabled && styles.pressed,
            ]}
          >
            <Text allowFontScaling={false} style={styles.skipText}>
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
            style={({ pressed }) => [
              styles.primaryButton,
              disabled && !submitting && styles.disabledButton,
              pressed && !actionDisabled && styles.primaryPressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={theme.colors.onBrandBlueAction} />
            ) : (
              <Text allowFontScaling={false} style={styles.primaryText}>
                {primaryLabel}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    footer: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.md,
    },
    footerStatus: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    countdown: {
      maxWidth: 128,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm,
    },
    skipButton: {
      minWidth: 62,
      minHeight: 34,
      borderRadius: appVisualTokens.radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceMuted,
      paddingHorizontal: appVisualTokens.spacing.md,
    },
    skipText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    primaryButton: {
      minWidth: 72,
      minHeight: 34,
      borderRadius: appVisualTokens.radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.brandBlue,
      paddingHorizontal: appVisualTokens.spacing.md,
    },
    primaryText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '900',
      color: theme.colors.onBrandBlueAction,
    },
    errorText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: theme.colors.danger,
    },
    disabledButton: {
      opacity: 0.38,
    },
    pressed: {
      opacity: 0.72,
    },
    primaryPressed: {
      backgroundColor: theme.colors.brandBlueStrong,
    },
  });
}
