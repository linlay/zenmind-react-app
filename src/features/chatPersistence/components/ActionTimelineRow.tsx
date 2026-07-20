import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon.tsx';
import { useT, type I18nKey } from '../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider.tsx';
import type {
  ChatTimelineActionNode,
  ChatTimelineActionPolicy,
  ChatTimelineActionStatus
} from '../../chatTimeline/index.ts';
import { ExecutionTimelineRow } from './ExecutionTimelineRow.tsx';

type ActionTimelineRowProps = {
  getInitialExpanded: (nodeId: string, fallback: boolean) => boolean;
  isLastInRun: boolean;
  node: ChatTimelineActionNode;
  onCopyText: (text: string) => void;
  onExpandedChange: (nodeId: string, expanded: boolean) => void;
};

const STATUS_KEYS: Record<ChatTimelineActionStatus, I18nKey> = {
  collecting: 'action.status.collecting',
  ready: 'action.status.ready',
  completed: 'action.status.completed',
  failed: 'action.status.failed',
  blocked: 'action.status.blocked'
};

const POLICY_KEYS: Record<ChatTimelineActionPolicy, I18nKey> = {
  allowed: 'action.policy.allowed',
  unsupported: 'action.policy.unsupported',
  unknown: 'action.policy.unknown'
};

const POLICY_REASON_KEYS: Record<string, I18nKey> = {
  mobile_whitelist: 'action.reason.mobileWhitelist',
  unsupported_on_mobile: 'action.reason.unsupportedOnMobile',
  not_in_mobile_whitelist: 'action.reason.notInMobileWhitelist'
};

const CARD_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-surface';
const SECTION_CLASS = 'gap-[3px] border-b border-app-line px-app-md py-app-sm last:border-b-0';
const SECTION_LABEL_CLASS = 'text-app-caption font-bold uppercase tracking-[0.4px] text-app-tertiary';
const VALUE_CLASS = 'text-app-footnote leading-[19px] text-app-primary';
const CODE_CLASS = 'font-mono text-[12px] leading-[18px] text-app-primary';
const REASON_CLASS = 'text-app-footnote font-semibold leading-[19px] text-app-danger';
const SUMMARY_CLASS = 'text-app-footnote leading-[18px] text-app-secondary';
const COPY_CLASS =
  'min-h-[34px] flex-row items-center justify-center gap-app-xs border-t border-app-line px-app-md py-app-sm active:bg-app-surface-muted';
const COPY_TEXT_CLASS = 'text-app-footnote font-bold text-app-brand-blue';

function toneForStatus(
  status: ChatTimelineActionStatus,
  colors: ReturnType<typeof useAppTheme>['theme']['colors']
): string {
  if (status === 'failed' || status === 'blocked') {
    return colors.danger;
  }
  if (status === 'completed') {
    return colors.success;
  }
  return colors.brandBlue;
}

function buildActionCopyText(node: ChatTimelineActionNode): string {
  return JSON.stringify(
    {
      actionId: node.actionId,
      actionName: node.actionName,
      target: node.target || undefined,
      status: node.status,
      policy: node.policy,
      arguments: node.args,
      result: node.result,
      error: node.errorReason || undefined
    },
    null,
    2
  );
}

export const ActionTimelineRow = memo(function ActionTimelineRow({
  getInitialExpanded,
  isLastInRun,
  node,
  onCopyText,
  onExpandedChange
}: ActionTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const defaultExpanded = node.policy !== 'allowed' || node.status === 'failed' || node.status === 'blocked';
  const [expanded, setExpanded] = useState(() => getInitialExpanded(node.id, defaultExpanded));
  const policyReasonKey = POLICY_REASON_KEYS[node.policyReason] ?? 'action.reason.notInMobileWhitelist';
  const policyReason = t(policyReasonKey);
  const metadata = [t(STATUS_KEYS[node.status]), node.target].filter(Boolean).join(' · ');
  const copyText = useMemo(() => buildActionCopyText(node), [node]);

  useEffect(() => {
    setExpanded(getInitialExpanded(node.id, defaultExpanded));
  }, [defaultExpanded, getInitialExpanded, node.id]);

  const handleToggle = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      onExpandedChange(node.id, next);
      return next;
    });
  }, [node.id, onExpandedChange]);
  const handleCopy = useCallback(() => onCopyText(copyText), [copyText, onCopyText]);

  return (
    <ExecutionTimelineRow
      badge={t(POLICY_KEYS[node.policy])}
      collapseLabel={t('action.collapse')}
      collapsedSummary={
        <Text allowFontScaling={false} numberOfLines={2} className={SUMMARY_CLASS}>
          {node.policy === 'allowed' ? node.resultText || node.target || t('action.reason.liveOnly') : policyReason}
        </Text>
      }
      expanded={expanded}
      expandLabel={t('action.expand')}
      iconUsage="runtime.tool"
      isLastInRun={isLastInRun}
      metadata={metadata}
      onToggle={handleToggle}
      title={node.actionName || node.actionId || t('action.title')}
      toneColor={toneForStatus(node.status, theme.colors)}
    >
      <View className={CARD_CLASS}>
        <View className={SECTION_CLASS}>
          <Text allowFontScaling={false} className={SECTION_LABEL_CLASS}>
            {t('action.field.id')}
          </Text>
          <Text allowFontScaling={false} selectable className={CODE_CLASS}>
            {node.actionId}
          </Text>
        </View>
        {node.target ? (
          <View className={SECTION_CLASS}>
            <Text allowFontScaling={false} className={SECTION_LABEL_CLASS}>
              {t('action.field.target')}
            </Text>
            <Text allowFontScaling={false} selectable className={VALUE_CLASS}>
              {node.target}
            </Text>
          </View>
        ) : null}
        {node.argsText ? (
          <View className={SECTION_CLASS}>
            <Text allowFontScaling={false} className={SECTION_LABEL_CLASS}>
              {t('runtime.section.args')}
            </Text>
            <Text allowFontScaling={false} selectable className={CODE_CLASS}>
              {node.argsText}
            </Text>
          </View>
        ) : null}
        {node.resultText ? (
          <View className={SECTION_CLASS}>
            <Text allowFontScaling={false} className={SECTION_LABEL_CLASS}>
              {t('runtime.section.result')}
            </Text>
            <Text allowFontScaling={false} selectable className={CODE_CLASS}>
              {node.resultText}
            </Text>
          </View>
        ) : null}
        <View className={SECTION_CLASS}>
          <Text allowFontScaling={false} className={SECTION_LABEL_CLASS}>
            {t('action.field.executionPolicy')}
          </Text>
          <Text allowFontScaling={false} selectable className={node.policy === 'allowed' ? VALUE_CLASS : REASON_CLASS}>
            {node.policy === 'allowed' ? `${policyReason} ${t('action.reason.liveOnly')}` : policyReason}
          </Text>
        </View>
        {node.errorReason ? (
          <View className={SECTION_CLASS}>
            <Text allowFontScaling={false} className={SECTION_LABEL_CLASS}>
              {t('action.field.error')}
            </Text>
            <Text allowFontScaling={false} selectable className={REASON_CLASS}>
              {node.errorReason}
            </Text>
          </View>
        ) : null}
        <Pressable
          accessibilityLabel={t('timeline.copy')}
          accessibilityRole="button"
          onPress={handleCopy}
          className={COPY_CLASS}
        >
          <AppIcon usage="runtime.copy" color={theme.colors.brandBlue} />
          <Text allowFontScaling={false} className={COPY_TEXT_CLASS}>
            {t('timeline.copy')}
          </Text>
        </Pressable>
      </View>
    </ExecutionTimelineRow>
  );
});
