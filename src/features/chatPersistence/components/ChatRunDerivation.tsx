import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
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
  const { theme } = useAppTheme();
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
  const label = t(
    node.derivation?.phase === 'ready'
      ? 'runDerivation.open'
      : node.derivation
        ? 'runDerivation.check'
        : 'runDerivation.create'
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: pending }}
      disabled={blocked}
      className="h-8 w-8 shrink-0 items-center justify-center rounded-app-sm active:opacity-[0.7]"
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
      {pending ? (
        <ActivityIndicator size="small" />
      ) : (
        <AppIcon usage="timeline.derive" color={blocked ? theme.colors.textTertiary : theme.colors.textSecondary} />
      )}
    </Pressable>
  );
});
