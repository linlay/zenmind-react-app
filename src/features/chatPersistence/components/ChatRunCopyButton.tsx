import { memo } from 'react';
import { Pressable, Text } from 'react-native';
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
      onPress={() => onCopyRun(runId)}
      className="min-h-[32px] justify-center px-app-sm"
    >
      <Text className="text-app-caption text-app-secondary">{t('transcript.copyRun')}</Text>
    </Pressable>
  );
});
