import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useT } from '../../../shared/i18n';
import type { ChatTimelineRunNode } from '../../chatTimeline/types.ts';
export const ChatRunDerivation = memo(function ChatRunDerivation({
  node,
  disabled,
  onDerive
}: {
  node: ChatTimelineRunNode;
  disabled: boolean;
  onDerive?: (runId: string) => Promise<void>;
}) {
  const t = useT(),
    [pending, setPending] = useState(false),
    busy = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (!onDerive || node.lifecycle === 'active' || node.completedAt === null) return null;
  const blocked = pending || (disabled && !node.derivation);
  return (
    <View className="flex-row items-center gap-app-sm">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked }}
        disabled={blocked}
        className="min-h-[32px] justify-center px-app-sm"
        onPress={() => {
          if (busy.current || blocked) return;
          busy.current = true;
          setPending(true);
          void onDerive(node.runId).finally(() => {
            busy.current = false;
            if (alive.current) setPending(false);
          });
        }}
      >
        <Text className={blocked ? 'text-app-caption text-app-tertiary' : 'text-app-caption text-app-brand'}>
          {t(
            node.derivation?.phase === 'ready'
              ? 'runDerivation.open'
              : node.derivation
                ? 'runDerivation.check'
                : 'runDerivation.create'
          )}
        </Text>
      </Pressable>
      {pending ? <ActivityIndicator size="small" /> : null}
      {node.derivation?.phase === 'unknown' && !pending ? (
        <Text selectable className="flex-1 text-app-caption text-app-secondary">
          {t('runDerivation.unknown')}
        </Text>
      ) : null}
    </View>
  );
});
