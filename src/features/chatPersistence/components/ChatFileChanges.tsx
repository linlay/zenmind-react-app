import { memo, useCallback, useMemo, useRef } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../../shared/i18n';
import type { ChatTimelineState } from '../../chatTimeline/types.ts';
import { createChatFileChangesProjector, type ChatFileChange, type ChatFileOperation } from '../chatFileChanges.ts';
import {
  parseConversationMarkdownInternalLink,
  resolveConversationMarkdownLinkPreview
} from '../markdownLinks/conversationMarkdownLinks.ts';
import { useAuthenticatedResourcePreview } from './resource/AuthenticatedResourcePreviewProvider.tsx';

type FileRow =
  | { kind: 'file'; key: string; change: ChatFileChange }
  | { kind: 'operation'; key: string; operation: ChatFileOperation };
function statistics(value: Pick<ChatFileChange, 'addedLines' | 'deletedLines' | 'editedLines'>): string {
  return `+${value.addedLines ?? '?'} / −${value.deletedLines ?? '?'} / ≈${value.editedLines ?? '?'}`;
}
const FileChangeRow = memo(function FileChangeRow({
  row,
  onOpen
}: {
  row: FileRow;
  onOpen: (operation: ChatFileOperation) => void;
}) {
  const t = useT();
  const operation = row.kind === 'file' ? row.change.operations.at(-1)! : row.operation;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('fileChanges.preview')}
      onPress={() => onOpen(operation)}
      className={
        row.kind === 'file'
          ? 'gap-app-xs border-t border-app-line px-app-lg py-app-md'
          : 'gap-app-xs px-app-xl py-app-sm'
      }
    >
      {row.kind === 'file' ? (
        <>
          <Text selectable className="text-app-footnote font-semibold text-app-primary">
            {row.change.filePath}
          </Text>
          <Text className="text-app-caption text-app-secondary">
            {statistics(row.change)} · {t('fileChanges.operations', { count: row.change.operations.length })}
          </Text>
          <Text selectable className="text-app-caption text-app-tertiary">
            {t('fileChanges.run')} {row.change.runId}
          </Text>
        </>
      ) : (
        <>
          <Text selectable className="text-app-caption text-app-secondary">
            {t(row.operation.operation === 'write' ? 'fileChanges.write' : 'fileChanges.edit')} · {row.operation.callId}
          </Text>
          <Text className="text-app-caption text-app-tertiary">
            {statistics(row.operation)} · {new Date(row.operation.updatedAt).toLocaleString()}
          </Text>
        </>
      )}
    </Pressable>
  );
});

/** Mount only while opened. Projection cache is released with the panel, never persisted. */
export const ChatFileChanges = memo(function ChatFileChanges({
  timeline,
  agentKey = '',
  onClose
}: {
  timeline: ChatTimelineState;
  agentKey?: string | null;
  onClose: () => void;
}) {
  const t = useT(),
    insets = useSafeAreaInsets();
  const { openPreview } = useAuthenticatedResourcePreview();
  const project = useRef<ReturnType<typeof createChatFileChangesProjector> | null>(null);
  if (!project.current) project.current = createChatFileChangesProjector();
  const changes = project.current(timeline);
  const rows = useMemo<FileRow[]>(
    () =>
      changes.flatMap((change) => [
        { kind: 'file' as const, key: `file:${change.key}`, change },
        ...change.operations.map((operation) => ({
          kind: 'operation' as const,
          key: `operation:${operation.key}`,
          operation
        }))
      ]),
    [changes]
  );
  const onOpen = useCallback(
    (operation: ChatFileOperation) => {
      const href = operation.filePath.startsWith('/') ? operation.filePath : `@workspace/${operation.filePath}`;
      const link = parseConversationMarkdownInternalLink(href) || {
        kind: 'invalid' as const,
        href,
        target: 'workspace' as const
      };
      const preview = resolveConversationMarkdownLinkPreview(link, operation.agentKey || agentKey || '');
      onClose();
      openPreview(
        preview,
        preview.errorCode === 'missing_agent_scope'
          ? t('markdownLink.workspaceScopeMissing')
          : preview.errorCode
            ? t('markdownLink.invalid')
            : ''
      );
    },
    [agentKey, onClose, openPreview, t]
  );
  const renderItem = useCallback(
    ({ item }: { item: FileRow }) => <FileChangeRow row={item} onOpen={onOpen} />,
    [onOpen]
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('fileChanges.close')}
          onPress={onClose}
          className="absolute inset-0 bg-app-overlay"
        />
        <View className="h-[75%] rounded-t-app-lg bg-app-surface" style={{ paddingBottom: insets.bottom }}>
          <View className="flex-row items-center justify-between border-b border-app-line px-app-lg py-app-md">
            <Text className="text-app-body font-semibold text-app-primary">{t('fileChanges.title')}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} className="min-h-[36px] justify-center px-app-sm">
              <Text className="text-app-footnote text-app-brand">{t('fileChanges.close')}</Text>
            </Pressable>
          </View>
          <Text className="px-app-lg py-app-sm text-app-caption text-app-secondary">{t('fileChanges.scope')}</Text>
          <FlatList
            data={rows}
            renderItem={renderItem}
            keyExtractor={(row) => row.key}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={5}
            className="flex-1"
            ListEmptyComponent={
              <Text className="px-app-lg py-app-xl text-app-footnote text-app-secondary">{t('fileChanges.empty')}</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
});
