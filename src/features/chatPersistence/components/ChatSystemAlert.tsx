import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { type I18nKey, type TFunction, useT } from '../../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import type { ChatTimelineMessageNode } from '../../chatTimeline/index.ts';
import { ChatTimelineRail } from './ChatTimelineRail';

const SYSTEM_ALERT_DIAGNOSTICS_MAX_HEIGHT = 220;

type ChatSystemAlertProps = {
  node: ChatTimelineMessageNode;
  isLastInRun: boolean;
};

type DetailLabels = {
  code: string;
  status: string;
  category: string;
  scope: string;
  retryable: string;
  message: string;
};

type DetailRow = {
  key: string;
  label: string;
  value: string;
};

function hasTechnicalDetail(errorDetail: ChatTimelineMessageNode['errorDetail']): boolean {
  return Boolean(
    errorDetail &&
      (errorDetail.message ||
        errorDetail.code ||
        errorDetail.category ||
        errorDetail.scope ||
        errorDetail.status != null ||
        errorDetail.retryable != null ||
        errorDetail.diagnostics != null)
  );
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildDetailRows(
  errorDetail: ChatTimelineMessageNode['errorDetail'],
  labels: DetailLabels
): DetailRow[] {
  if (!errorDetail) {
    return [];
  }

  return [
    {
      key: 'code',
      label: labels.code,
      value: formatDetailValue(errorDetail.code),
    },
    {
      key: 'status',
      label: labels.status,
      value: formatDetailValue(errorDetail.status),
    },
    {
      key: 'category',
      label: labels.category,
      value: formatDetailValue(errorDetail.category),
    },
    {
      key: 'scope',
      label: labels.scope,
      value: formatDetailValue(errorDetail.scope),
    },
    {
      key: 'retryable',
      label: labels.retryable,
      value: formatDetailValue(errorDetail.retryable),
    },
    {
      key: 'message',
      label: labels.message,
      value: formatDetailValue(errorDetail.message),
    },
  ].filter((row) => row.value);
}

function translateIfAvailable(t: TFunction, key: string): string {
  if (!key) {
    return '';
  }
  const translated = t(key as I18nKey);
  return translated && translated !== key ? translated : '';
}

function includesRetryIntent(message: string, retryHint: string): boolean {
  const normalized = message.toLowerCase();
  return Boolean(
    retryHint && message.includes(retryHint)
  ) || normalized.includes('retry') || normalized.includes('try again');
}

function resolveSystemAlertMessage(
  nodeContent: string,
  errorDetail: ChatTimelineMessageNode['errorDetail'],
  t: TFunction
): string {
  const codeMessage = translateIfAvailable(
    t,
    errorDetail?.code ? `platformError.code.${errorDetail.code}` : ''
  );
  const categoryMessage = translateIfAvailable(
    t,
    errorDetail?.category ? `platformError.category.${errorDetail.category}` : ''
  );
  const fallbackMessage = nodeContent || errorDetail?.message || t('platformError.generic');
  const retryHint =
    errorDetail?.retryable === true ? translateIfAvailable(t, 'platformError.retryableHint') : '';
  const baseMessage = codeMessage || categoryMessage || fallbackMessage;
  return retryHint && !includesRetryIntent(baseMessage, retryHint)
    ? `${baseMessage} ${retryHint}`
    : baseMessage;
}

export const ChatSystemAlert = memo(function ChatSystemAlert({
  node,
  isLastInRun,
}: ChatSystemAlertProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const [expanded, setExpanded] = useState(false);
  const errorDetail = node.errorDetail ?? null;
  const canExpand = hasTechnicalDetail(errorDetail);
  const message = resolveSystemAlertMessage(node.content, errorDetail, t);
  const rows = useMemo(() => {
    if (!expanded) {
      return [];
    }
    return buildDetailRows(errorDetail, {
      code: t('platformError.detail.code'),
      status: t('platformError.detail.status'),
      category: t('platformError.detail.category'),
      scope: t('platformError.detail.scope'),
      retryable: t('platformError.detail.retryable'),
      message: t('platformError.detail.message'),
    });
  }, [errorDetail, expanded, t]);
  const diagnosticsText = useMemo(
    () =>
      expanded && errorDetail?.diagnostics != null
        ? formatDetailValue(errorDetail.diagnostics)
        : '',
    [errorDetail, expanded]
  );

  const handleToggle = useCallback(() => {
    if (canExpand) {
      setExpanded((value) => !value);
    }
  }, [canExpand]);

  return (
    <View style={styles.timelineRow}>
      <ChatTimelineRail
        iconUsage="timeline.systemAlertRail"
        terminal={isLastInRun}
        toneColor={theme.colors.danger}
      />
      <View style={styles.timelineBody}>
        <View style={styles.systemAlert}>
          <Text allowFontScaling={false} selectable style={styles.systemAlertMessage}>
            {message}
          </Text>
          {canExpand ? (
            <Pressable
              accessibilityLabel={
                expanded ? t('timeline.collapseContent') : t('timeline.expandContent')
              }
              accessibilityRole="button"
              onPress={handleToggle}
              style={({ pressed }) => [
                styles.systemAlertDetailsHeader,
                pressed && styles.rowPressed,
              ]}
            >
              <Text allowFontScaling={false} style={styles.systemAlertDetailsTitle}>
                {t('platformError.technicalDetails')}
              </Text>
              <AppIcon
                usage={expanded ? 'runtime.collapse' : 'runtime.expand'}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          ) : null}
          {expanded ? (
            <View style={styles.systemAlertDetails}>
              {rows.map((row) => (
                <View key={row.key} style={styles.systemAlertDetailRow}>
                  <Text allowFontScaling={false} style={styles.systemAlertDetailLabel}>
                    {row.label}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    selectable
                    style={styles.systemAlertDetailValue}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
              {diagnosticsText ? (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  style={styles.systemAlertDiagnosticsScroll}
                  contentContainerStyle={styles.systemAlertDiagnosticsContent}
                >
                  <Text
                    allowFontScaling={false}
                    selectable
                    style={styles.systemAlertDiagnosticsText}
                  >
                    {diagnosticsText}
                  </Text>
                </ScrollView>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8,
      marginBottom: 16,
    },
    timelineBody: {
      flex: 1,
      minWidth: 0,
    },
    systemAlert: {
      alignSelf: 'stretch',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.dangerLine,
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.dangerSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    systemAlertMessage: {
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
      color: theme.colors.danger,
    },
    systemAlertDetailsHeader: {
      marginTop: 8,
      minHeight: 24,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    systemAlertDetailsTitle: {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.textSecondary,
    },
    systemAlertDetails: {
      marginTop: 6,
      gap: 5,
    },
    systemAlertDetailRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    systemAlertDetailLabel: {
      width: 58,
      flexShrink: 0,
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textSecondary,
    },
    systemAlertDetailValue: {
      flex: 1,
      minWidth: 0,
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textPrimary,
    },
    systemAlertDiagnosticsScroll: {
      marginTop: 5,
      maxHeight: SYSTEM_ALERT_DIAGNOSTICS_MAX_HEIGHT,
      borderRadius: appVisualTokens.radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
    },
    systemAlertDiagnosticsContent: {
      padding: 8,
    },
    systemAlertDiagnosticsText: {
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
      color: theme.colors.textPrimary,
    },
    rowPressed: {
      opacity: 0.72,
    },
  });
}
