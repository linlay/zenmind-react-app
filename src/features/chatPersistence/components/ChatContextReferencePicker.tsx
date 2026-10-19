import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../../shared/components/ScreenHeader';
import { useT } from '../../../shared/i18n';
import { chatSyncService } from '../../chatRealtime/chatSyncService';
import type { ChatReferenceOption } from '../chatContextReference.ts';

export function ChatContextReferencePicker({
  conversationId,
  kind = 'chat',
  onSelect,
  onClose
}: {
  conversationId: string;
  kind?: 'chat' | 'kbase';
  onSelect: (item: ChatReferenceOption) => boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [items, setItems] = useState<ChatReferenceOption[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [search, setSearch] = useState('');
  const alive = useRef(true),
    busy = useRef(false);
  const load = useCallback(
    async (lastRunId?: string) => {
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      setError('');
      try {
        const page =
          kind === 'kbase'
            ? await chatSyncService.listReferenceKbases(conversationId)
            : await chatSyncService.listReferenceChats(conversationId, lastRunId);
        if (!alive.current) return;
        setItems((current) =>
          lastRunId ? [...new Map([...current, ...page.items].map((item) => [item.id, item])).values()] : page.items
        );
        setCursor(page.nextCursor);
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        busy.current = false;
        if (alive.current) setLoading(false);
      }
    },
    [conversationId, kind]
  );
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? items.filter((item) => `${item.name}\n${item.id}`.toLocaleLowerCase().includes(query)) : items;
  }, [items, search]);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-app-background">
        <ScreenHeader
          title={t(kind === 'kbase' ? 'contextReference.chooseKbase' : 'contextReference.chooseChat')}
          leftActions={[
            <Pressable key="close" onPress={onClose} accessibilityRole="button" className="px-app-sm py-app-sm">
              <Text className="text-app-footnote text-app-brand">{t('selection.close')}</Text>
            </Pressable>
          ]}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('contextReference.search')}
          accessibilityLabel={t('contextReference.search')}
          className="mx-app-md my-app-sm rounded-app-md border border-app-line p-app-sm text-app-body text-app-primary"
        />
        <Text className="px-app-md pb-app-sm text-app-caption text-app-secondary">
          {t('contextReference.loadedSearch')}
        </Text>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                if (onSelect(item)) onClose();
              }}
              accessibilityRole="button"
              className="border-b border-app-line px-app-md py-app-md"
            >
              <Text numberOfLines={1} className="text-app-body text-app-primary">
                {item.name}
              </Text>
              <Text numberOfLines={1} className="text-app-caption text-app-secondary">
                {item.id}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            !loading ? <Text className="p-app-md text-app-secondary">{t('contextReference.empty')}</Text> : null
          }
          ListFooterComponent={
            <View className="items-center gap-app-sm py-app-md">
              {loading ? <ActivityIndicator /> : null}
              {error ? (
                <>
                  <Text className="px-app-md text-app-caption text-app-secondary">{error}</Text>
                  <Pressable onPress={() => void load(cursor || undefined)} accessibilityRole="button">
                    <Text className="text-app-brand">{t('contextReference.retry')}</Text>
                  </Pressable>
                </>
              ) : null}
              {cursor && !loading && !error ? (
                <Pressable onPress={() => void load(cursor)} accessibilityRole="button">
                  <Text className="text-app-brand">{t('contextReference.loadMore')}</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}
