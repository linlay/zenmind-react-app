import { memo, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useConversationPreviewRowActive } from '../../../shared/components/conversationPreview/ConversationPreviewProvider';
import { useT } from '../../../shared/i18n';
import { chatSyncService } from '../../chatRealtime/chatSyncService';
import type { ChatTimelineToolNode } from '../../chatTimeline';

export const ChatToolWait = memo(function ChatToolWait({
  node,
  conversationId
}: {
  node: ChatTimelineToolNode;
  conversationId: string;
}) {
  const t = useT();
  const visible = useConversationPreviewRowActive();
  const [now, setNow] = useState(Date.now);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const wait = node.toolWait;
  const active = visible && node.lifecycle === 'active' && Boolean(wait);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, wait?.deadlineAt]);
  useEffect(() => {
    setPending(false);
    setError(false);
  }, [node.id, node.lifecycle]);
  const child = Boolean(node.taskId && node.toolId.startsWith(`${node.taskId}:`));
  const seconds = wait ? Math.max(0, Math.ceil((wait.deadlineAt - now) / 1000)) : 0;
  const resume = async () => {
    if (pending || !active || child) return;
    setPending(true);
    setError(false);
    try {
      const result = await chatSyncService.continueWait(conversationId, node.toolId);
      if (result.accepted !== true) throw new Error('Wait was not continued');
    } catch {
      setPending(false);
      setError(true);
    }
  };
  return (
    <View className="my-2 gap-2 rounded-app-md border border-app-line bg-app-surface px-app-md py-app-sm">
      <Text className="text-app-body text-app-primary">{wait?.description || node.toolLabel || 'wait'}</Text>
      {active ? (
        <View className="flex-row items-center justify-between gap-app-sm">
          <Text className="text-app-caption text-app-secondary">
            {seconds
              ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
              : t('timeline.wait.pending')}
            {wait?.conditions.length
              ? ` · ${wait.conditions.filter((item) => item.satisfied).length}/${wait.conditions.length}`
              : ''}
          </Text>
          {!child ? (
            <Pressable
              disabled={pending}
              onPress={() => void resume()}
              accessibilityRole="button"
              className="rounded-app-sm bg-app-action px-app-sm py-app-xs"
            >
              <Text className="text-app-footnote text-app-on-action">
                {t(pending ? 'timeline.wait.pending' : 'timeline.wait.continue')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text className="text-app-caption text-app-secondary">
          {t(node.lifecycle === 'active' ? 'timeline.wait.pending' : 'timeline.wait.finished')}
        </Text>
      )}
      {error ? <Text className="text-app-caption text-app-danger">{t('timeline.wait.failed')}</Text> : null}
    </View>
  );
});
