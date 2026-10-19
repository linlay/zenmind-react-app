import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_FEEDBACK_COMMENT_CHARS } from '../../../core/api/services/chatFeedbackProtocol.ts';
import { ScreenHeader } from '../../../shared/components/ScreenHeader';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { useT } from '../../../shared/i18n';
import { chatSyncService } from '../../chatRealtime/chatSyncService';
import type { ChatTimelineRunNode } from '../../chatTimeline/types.ts';

export const ChatRunFeedback = memo(function ChatRunFeedback({
  conversationId,
  node
}: {
  conversationId: string;
  node: ChatTimelineRunNode;
}) {
  const t = useT(),
    [open, setOpen] = useState(false),
    [comment, setComment] = useState(''),
    [error, setError] = useState('');
  const { theme } = useAppTheme();
  const alive = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const feedback = node.feedbackPending ? node.feedbackPending.feedback : node.feedback;
  const pending = !!node.feedbackPending;
  const submit = async (type: 'thumbs_down' | 'clear') => {
    if (busy.current || pending) return;
    busy.current = true;
    setOpen(false);
    setError('');
    try {
      await chatSyncService.submitRunFeedback(conversationId, node.runId, type, type === 'clear' ? undefined : comment);
    } catch (e) {
      if (alive.current) {
        if (type === 'clear') setComment(node.feedback?.comment || '');
        setError(e instanceof Error ? e.message : String(e));
        setOpen(true);
      }
    } finally {
      busy.current = false;
    }
  };
  if (node.lifecycle === 'active' || node.completedAt === null) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(feedback ? 'runFeedback.downvoted' : 'runFeedback.downvote')}
        accessibilityState={{ selected: !!feedback, disabled: pending, busy: pending }}
        disabled={pending}
        onPress={() => {
          if (!error) setComment(feedback?.comment || '');
          setOpen(true);
        }}
        className="h-8 w-8 shrink-0 items-center justify-center rounded-app-sm active:opacity-[0.7]"
      >
        {pending ? (
          <ActivityIndicator size="small" />
        ) : (
          <AppIcon usage="timeline.feedback" color={feedback ? theme.colors.brandBlue : theme.colors.textSecondary} />
        )}
      </Pressable>
      {open ? (
        <Modal visible animationType="slide" onRequestClose={() => setOpen(false)}>
          <SafeAreaView className="flex-1 bg-app-background">
            <ScreenHeader
              title={t('runFeedback.title')}
              leftActions={[
                <Pressable
                  key="cancel"
                  accessibilityRole="button"
                  onPress={() => setOpen(false)}
                  className="px-app-sm py-app-sm"
                >
                  <Text className="text-app-footnote text-app-secondary">{t('runFeedback.cancel')}</Text>
                </Pressable>
              ]}
              rightActions={[
                <Pressable
                  key="submit"
                  accessibilityRole="button"
                  disabled={pending}
                  onPress={() => void submit('thumbs_down')}
                  className="px-app-sm py-app-sm"
                >
                  <Text className="text-app-footnote text-app-brand">{t('runFeedback.submit')}</Text>
                </Pressable>
              ]}
            />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 p-app-md">
              {error ? (
                <Text selectable accessibilityRole="alert" className="mb-2 text-app-caption text-app-danger">
                  {t('runFeedback.failed')} · {error}
                </Text>
              ) : null}
              <TextInput
                multiline
                autoFocus
                textAlignVertical="top"
                value={comment}
                onChangeText={setComment}
                maxLength={MAX_FEEDBACK_COMMENT_CHARS}
                placeholder={t('runFeedback.comment')}
                accessibilityLabel={t('runFeedback.comment')}
                className="min-h-[120px] rounded-app-md border border-app-line p-app-sm text-app-body text-app-primary"
              />
              {feedback ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('runFeedback.clear')}
                  disabled={pending}
                  onPress={() => void submit('clear')}
                  className="min-h-[44px] justify-center self-start px-app-sm"
                >
                  <Text className="text-app-caption text-app-secondary">{t('runFeedback.clear')}</Text>
                </Pressable>
              ) : null}
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      ) : null}
    </>
  );
});
