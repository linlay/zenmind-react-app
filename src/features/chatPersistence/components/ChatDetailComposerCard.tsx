import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import type { ChatComposerAttachment } from '../types';
import { Composer, type ComposerAttachmentType } from './Composer';
import type { ChatComposerPrimaryAction } from '../chatDetailViewModel';

type ChatDetailComposerCardProps = {
  draft: string;
  attachments: ChatComposerAttachment[];
  errorText: string;
  primaryAction: ChatComposerPrimaryAction;
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
  onChangeDraft,
  onSubmit,
  onStop,
  onResume,
  onSelectAttachment,
  onRemoveAttachment,
  onRetryAttachment,
}: ChatDetailComposerCardProps) {
  const styles = useAppThemeStyles(createStyles);

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
      />
      {errorText ? (
        <Text allowFontScaling={false} style={styles.errorText}>
          {errorText}
        </Text>
      ) : null}
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    composerWrap: {
      paddingHorizontal: appVisualTokens.spacing.lg,
      paddingTop: 5,
      paddingBottom: 6,
      backgroundColor: theme.colors.background,
    },
    errorText: {
      marginTop: appVisualTokens.spacing.sm,
      paddingHorizontal: appVisualTokens.spacing.md,
      fontSize: 13,
      lineHeight: 20,
      color: theme.colors.danger,
    },
  });
}
