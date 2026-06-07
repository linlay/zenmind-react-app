import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { appVisualTokens } from '../../../shared/visual/foundation';
import type { ChatTimelineUsageSummary } from '../../chatTimeline/index.ts';
import type { ChatComposerAttachment } from '../types';
import { Composer, type ComposerAttachmentType } from './Composer';
import { ChatUsageStatsButton } from './ChatUsageStats';
import type { ChatComposerPrimaryAction } from '../chatDetailViewModel';

type ChatDetailComposerCardProps = {
  draft: string;
  attachments: ChatComposerAttachment[];
  errorText: string;
  primaryAction: ChatComposerPrimaryAction;
  usageLabel: string;
  usageSummary: ChatTimelineUsageSummary | null;
  onChangeDraft: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onResume: () => void;
  onSelectAttachment: (type: ComposerAttachmentType) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRetryAttachment: (attachmentId: string) => void;
};

export const ChatDetailComposerCard = memo(function ChatDetailComposerCard({
  draft,
  attachments,
  errorText,
  primaryAction,
  usageLabel,
  usageSummary,
  onChangeDraft,
  onSubmit,
  onStop,
  onResume,
  onSelectAttachment,
  onRemoveAttachment,
  onRetryAttachment,
}: ChatDetailComposerCardProps) {
  const normalizedUsageLabel = usageLabel.trim();
  const usageAccessory =
    normalizedUsageLabel || usageSummary ? (
      <ChatUsageStatsButton usageLabel={normalizedUsageLabel} usageSummary={usageSummary} />
    ) : null;

  return (
    <View style={styles.composerWrap}>
      <Composer
        value={draft}
        attachments={attachments}
        onChangeText={onChangeDraft}
        primaryAction={primaryAction}
        onSubmit={onSubmit}
        onStop={onStop}
        onResume={onResume}
        onSelectAttachment={onSelectAttachment}
        onRemoveAttachment={onRemoveAttachment}
        onRetryAttachment={onRetryAttachment}
        rightAccessory={usageAccessory}
      />
      {errorText ? (
        <Text allowFontScaling={false} style={styles.errorText}>
          {errorText}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  composerWrap: {
    paddingHorizontal: appVisualTokens.spacing.lg,
    paddingTop: 5,
    paddingBottom: 6,
    backgroundColor: appVisualTokens.colors.background,
  },
  errorText: {
    marginTop: appVisualTokens.spacing.sm,
    paddingHorizontal: appVisualTokens.spacing.md,
    fontSize: 13,
    lineHeight: 20,
    color: appVisualTokens.colors.danger,
  },
});
