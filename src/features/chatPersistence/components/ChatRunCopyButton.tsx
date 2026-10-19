import { memo } from 'react';
import { Pressable } from 'react-native';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
export const ChatRunCopyButton = memo(function ChatRunCopyButton({
  runId,
  onCopyRun
}: {
  runId: string;
  onCopyRun?: (runId: string) => void;
}) {
  const t = useT();
  if (!runId || !onCopyRun) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('transcript.copyRun')}
      onPress={() => onCopyRun(runId)}
      className="min-h-[32px] min-w-[32px] items-center justify-center px-app-sm"
    >
      <AppIcon usage="timeline.copy" />
    </Pressable>
  );
});
