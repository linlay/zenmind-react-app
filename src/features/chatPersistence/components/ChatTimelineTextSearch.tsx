import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useT } from '../../../shared/i18n';
import type { ChatTimelineState } from '../../chatTimeline/types.ts';
import {
  chatSearchMatchKey,
  createChatTimelineTextSearch,
  MAX_CHAT_SEARCH_MATCHES,
  type ChatTextSearchResult
} from '../chatTimelineTextSearch.ts';

const EMPTY_RESULT: ChatTextSearchResult = { query: '', matches: [], total: 0 };
const SEARCH_DELAY_MS = 180;
export const ChatTimelineTextSearch = memo(function ChatTimelineTextSearch({
  timeline,
  onReveal,
  onSelectNode,
  onActiveChange,
  onOpenFileChanges
}: {
  timeline: ChatTimelineState;
  onReveal: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onActiveChange: (open: boolean) => void;
  onOpenFileChanges?: () => void;
}) {
  const t = useT(),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [result, setResult] = useState(EMPTY_RESULT),
    [selected, setSelected] = useState('');
  const latest = useRef({ timeline, onReveal, onSelectNode, onActiveChange });
  latest.current = { timeline, onReveal, onSelectNode, onActiveChange };
  const cache = useRef<ReturnType<typeof createChatTimelineTextSearch> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    queryRef = useRef(''),
    selectedRef = useRef(''),
    revealOnCompute = useRef(false);
  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const schedule = useCallback(
    (explicitQuery: boolean) => {
      if (explicitQuery) {
        clearTimer();
        revealOnCompute.current = true;
      }
      if (timer.current !== null) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        const next = cache.current?.search(latest.current.timeline, queryRef.current) ?? EMPTY_RESULT;
        const active =
          next.matches.find((match) => chatSearchMatchKey(match) === selectedRef.current) ?? next.matches[0];
        const key = active ? chatSearchMatchKey(active) : '';
        selectedRef.current = key;
        setSelected(key);
        setResult(next);
        latest.current.onSelectNode(active?.nodeId || '');
        if (revealOnCompute.current && active) latest.current.onReveal(active.nodeId);
        revealOnCompute.current = false;
      }, SEARCH_DELAY_MS);
    },
    [clearTimer]
  );
  useEffect(() => {
    if (open && queryRef.current.trim()) schedule(false);
  }, [open, schedule, timeline]);
  useEffect(
    () => () => {
      clearTimer();
      cache.current?.clear();
      latest.current.onActiveChange(false);
      latest.current.onSelectNode('');
    },
    [clearTimer]
  );
  const activeIndex = useMemo(
      () => result.matches.findIndex((match) => chatSearchMatchKey(match) === selected),
      [result.matches, selected]
    ),
    active = result.matches[activeIndex];
  const move = (step: number) => {
    if (!result.matches.length) return;
    const next = result.matches[(activeIndex + step + result.matches.length) % result.matches.length]!;
    const key = chatSearchMatchKey(next);
    selectedRef.current = key;
    setSelected(key);
    onSelectNode(next.nodeId);
    onReveal(next.nodeId);
  };
  const close = () => {
    clearTimer();
    cache.current?.clear();
    cache.current = null;
    queryRef.current = '';
    selectedRef.current = '';
    revealOnCompute.current = false;
    setQuery('');
    setSelected('');
    setResult(EMPTY_RESULT);
    setOpen(false);
    onActiveChange(false);
    onSelectNode('');
  };
  if (!open)
    return (
      <View className="flex-row items-center justify-end">
        {onOpenFileChanges ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenFileChanges}
            className="min-h-[32px] justify-center px-app-md"
          >
            <Text className="text-app-caption text-app-secondary">{t('fileChanges.title')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            cache.current = createChatTimelineTextSearch();
            setOpen(true);
            onActiveChange(true);
          }}
          className="min-h-[32px] justify-center self-end px-app-md"
        >
          <Text className="text-app-caption text-app-secondary">{t('textSearch.open')}</Text>
        </Pressable>
      </View>
    );
  return (
    <View className="gap-app-xs border-b border-app-line px-app-md py-app-xs">
      <View className="flex-row items-center gap-app-sm">
        <TextInput
          autoFocus
          value={query}
          maxLength={128}
          accessibilityLabel={t('textSearch.placeholder')}
          placeholder={t('textSearch.placeholder')}
          returnKeyType="search"
          onSubmitEditing={() => move(1)}
          onChangeText={(value) => {
            queryRef.current = value;
            selectedRef.current = '';
            setQuery(value);
            setSelected('');
            setResult(EMPTY_RESULT);
            onSelectNode('');
            schedule(true);
          }}
          className="min-h-[36px] min-w-0 flex-1 rounded-app-sm bg-app-surface-muted px-app-sm text-app-footnote text-app-primary"
        />
        {(['prev', 'next'] as const).map((direction) => (
          <Pressable
            key={direction}
            accessibilityRole="button"
            disabled={!result.matches.length}
            onPress={() => move(direction === 'prev' ? -1 : 1)}
            className="min-h-[36px] justify-center px-app-xs"
          >
            <Text
              className={
                result.matches.length ? 'text-app-caption text-app-brand' : 'text-app-caption text-app-tertiary'
              }
            >
              {t(direction === 'prev' ? 'textSearch.prev' : 'textSearch.next')}
            </Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={close} className="min-h-[36px] justify-center px-app-xs">
          <Text className="text-app-caption text-app-secondary">{t('textSearch.close')}</Text>
        </Pressable>
      </View>
      <Text className="text-app-caption text-app-tertiary">
        {t('textSearch.scope')} · {activeIndex + 1}/{result.total}
        {result.total > MAX_CHAT_SEARCH_MATCHES
          ? ` · ${t('textSearch.limited', { count: MAX_CHAT_SEARCH_MATCHES })}`
          : ''}
      </Text>
      {active ? (
        <Text selectable numberOfLines={3} className="text-app-caption text-app-secondary">
          {active.before}
          <Text className="font-bold text-app-brand">{active.text}</Text>
          {active.after}
        </Text>
      ) : query.trim() && result.query ? (
        <Text className="text-app-caption text-app-secondary">{t('textSearch.empty')}</Text>
      ) : null}
    </View>
  );
});
