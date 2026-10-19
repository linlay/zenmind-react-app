import { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import { useConversationPreviewRowActive } from '../../../shared/components/conversationPreview/ConversationPreviewProvider.tsx';
import { useT } from '../../../shared/i18n';
import type { ChatTimelineLifecycle, ChatTimelineToolNode } from '../../chatTimeline/types.ts';
import { buildChatImageGenerationSlots, type ChatImageSlot } from '../chatImageGeneration.ts';
import { useAuthenticatedResourcePreview } from './resource/AuthenticatedResourcePreviewProvider.tsx';
import { useAuthenticatedResourceSource } from './resource/useAuthenticatedResourceSource.ts';

const ImageSlot = memo(function ImageSlot({ slot }: { slot: ChatImageSlot }) {
  const t = useT(),
    active = useConversationPreviewRowActive();
  const { openPreview } = useAuthenticatedResourcePreview();
  const source = useAuthenticatedResourceSource(slot.resourceUrl, active && slot.status === 'success', slot.name);
  const [decodeFailed, setDecodeFailed] = useState(false);
  useEffect(() => setDecodeFailed(false), [slot.resourceUrl, source.source]);
  const failed = decodeFailed || !!source.error;
  const busy = ['preparing', 'generation', 'edit', 'inpainting', 'recovering'].includes(slot.status);
  return (
    <View className="w-[168px] gap-app-xs">
      <Pressable
        className="h-[148px] items-center justify-center overflow-hidden rounded-app-md border border-app-line bg-app-background-muted"
        accessibilityRole={slot.status === 'success' ? 'button' : 'text'}
        accessibilityLabel={t('imageGeneration.slot', { index: slot.index + 1 })}
        disabled={slot.status !== 'success'}
        onPress={() =>
          openPreview({ key: slot.key, name: slot.name, resourceUrl: slot.resourceUrl, previewKind: 'image' })
        }
      >
        {slot.status === 'success' && source.source && !failed ? (
          <Image
            source={source.source}
            resizeMode="contain"
            className="h-full w-full"
            onError={() => setDecodeFailed(true)}
          />
        ) : (
          <>
            {busy || source.loading ? <ActivityIndicator /> : null}
            <Text className="px-app-sm text-center text-app-caption text-app-secondary">
              {t(failed ? 'imageGeneration.loadFailed' : `imageGeneration.${slot.status}`)}
            </Text>
          </>
        )}
      </Pressable>
      <Text className="text-app-caption text-app-secondary">
        {t('imageGeneration.slot', { index: slot.index + 1 })}
      </Text>
      {slot.status === 'failed' ? (
        <Text numberOfLines={3} selectable className="text-app-caption text-app-danger">
          {slot.error || t('imageGeneration.noReason')}
        </Text>
      ) : null}
      {failed ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDecodeFailed(false);
            source.retry();
          }}
        >
          <Text className="text-app-caption text-app-brand">{t('imageGeneration.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export const ChatImageGeneration = memo(function ChatImageGeneration({
  nodes,
  conversationId,
  runLifecycle
}: {
  nodes: readonly ChatTimelineToolNode[];
  conversationId: string;
  runLifecycle?: ChatTimelineLifecycle;
}) {
  const slots = useMemo(
    () => nodes.flatMap((node) => buildChatImageGenerationSlots(node, conversationId, runLifecycle)),
    [nodes, conversationId, runLifecycle]
  );
  return (
    <FlatList
      horizontal
      data={slots}
      keyExtractor={(slot) => slot.key}
      renderItem={({ item }) => <ImageSlot slot={item} />}
      initialNumToRender={2}
      maxToRenderPerBatch={4}
      windowSize={3}
      showsHorizontalScrollIndicator={false}
      className="mt-app-sm"
      contentContainerClassName="gap-app-sm"
    />
  );
});
