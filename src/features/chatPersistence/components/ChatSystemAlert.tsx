import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { type I18nKey, type TFunction, useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import type { ChatTimelineMessageNode } from '../../chatTimeline/index.ts';
import { ChatTimelineRail } from './ChatTimelineRail';

const TIMELINE_ROW_CLASS = 'mb-4 flex-row items-stretch gap-2';
const TIMELINE_BODY_CLASS = 'min-w-0 flex-1';
const SYSTEM_ALERT_CLASS =
  'self-stretch rounded-app-sm border border-app-danger-line bg-app-danger-soft px-[10px] py-2';
const SYSTEM_ALERT_MESSAGE_CLASS = 'text-[13px] font-bold leading-[19px] text-app-danger';
const DETAILS_HEADER_CLASS = 'mt-2 min-h-6 flex-row items-center gap-1 self-start active:opacity-[0.72]';
const DETAILS_TITLE_CLASS = 'text-[12px] leading-4 text-app-secondary';
const DETAILS_CLASS = 'mt-[6px] gap-[5px]';
const DETAIL_ROW_CLASS = 'flex-row items-start gap-2';
const DETAIL_LABEL_CLASS = 'w-[58px] shrink-0 text-[12px] leading-[18px] text-app-secondary';
const DETAIL_VALUE_CLASS = 'min-w-0 flex-1 font-mono text-[12px] leading-[18px] text-app-primary';
const DIAGNOSTICS_SCROLL_CLASS = 'mt-[5px] max-h-[220px] rounded-app-sm border border-app-line bg-app-surface';
const DIAGNOSTICS_CONTENT_CLASS = 'p-2';
const DIAGNOSTICS_TEXT_CLASS = 'font-mono text-[12px] leading-[18px] text-app-primary';

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
    <View className={TIMELINE_ROW_CLASS}>
      <ChatTimelineRail
        iconUsage="timeline.systemAlertRail"
        terminal={isLastInRun}
        toneColor={theme.colors.danger}
      />
      <View className={TIMELINE_BODY_CLASS}>
        <View className={SYSTEM_ALERT_CLASS}>
          <Text allowFontScaling={false} selectable className={SYSTEM_ALERT_MESSAGE_CLASS}>
            {message}
          </Text>
          {canExpand ? (
            <Pressable
              accessibilityLabel={
                expanded ? t('timeline.collapseContent') : t('timeline.expandContent')
              }
              accessibilityRole="button"
              onPress={handleToggle}
              className={DETAILS_HEADER_CLASS}
            >
              <Text allowFontScaling={false} className={DETAILS_TITLE_CLASS}>
                {t('platformError.technicalDetails')}
              </Text>
              <AppIcon
                usage={expanded ? 'runtime.collapse' : 'runtime.expand'}
                color={theme.colors.textSecondary}
              />
            </Pressable>
          ) : null}
          {expanded ? (
            <View className={DETAILS_CLASS}>
              {rows.map((row) => (
                <View key={row.key} className={DETAIL_ROW_CLASS}>
                  <Text allowFontScaling={false} className={DETAIL_LABEL_CLASS}>
                    {row.label}
                  </Text>
                  <Text
                    allowFontScaling={false}
                    selectable
                    className={DETAIL_VALUE_CLASS}
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
              {diagnosticsText ? (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  className={DIAGNOSTICS_SCROLL_CLASS}
                  contentContainerClassName={DIAGNOSTICS_CONTENT_CLASS}
                >
                  <Text
                    allowFontScaling={false}
                    selectable
                    className={DIAGNOSTICS_TEXT_CLASS}
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
