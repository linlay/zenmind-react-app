import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import type { ChatTimelineSource, ChatTimelineSourceChunk, ChatTimelineSourceNode } from '../../chatTimeline/index.ts';
import { ChatTimelineRail } from './ChatTimelineRail';

type SourceTimelineRowProps = {
  node: ChatTimelineSourceNode;
  isLastInRun: boolean;
  getInitialExpanded: (nodeId: string, fallback: boolean) => boolean;
  onExpandedChange: (nodeId: string, expanded: boolean) => void;
};

const SOURCE_PAGE_SIZE = 12;
const CHUNK_PAGE_SIZE = 8;
const ROW_CLASS = 'mb-4 flex-row items-stretch gap-2';
const BODY_CLASS = 'min-w-0 flex-1 gap-[7px]';
const HEADER_CLASS = 'min-h-[28px] flex-row items-center gap-[7px] active:opacity-[0.72]';
const HEADER_LEADING_CLASS = 'min-w-0 flex-1 gap-[1px]';
const TITLE_CLASS = 'text-[14px] font-bold leading-5 text-app-primary';
const QUERY_CLASS = 'text-[12px] leading-[17px] text-app-secondary';
const STATUS_CLASS = 'text-[12px] leading-[18px] text-app-secondary';
const ERROR_STATUS_CLASS = 'text-[12px] font-semibold leading-[18px] text-app-danger';
const FOLD_CLASS = 'h-[28px] w-[28px] items-center justify-center rounded-app-sm';
const SOURCE_LIST_CLASS = 'gap-app-sm';
const SOURCE_CARD_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-surface';
const SOURCE_CARD_HEADER_CLASS =
  'min-h-[54px] flex-row items-center gap-app-sm px-app-md py-[9px] active:bg-app-surface-muted';
const SOURCE_CARD_HEADING_CLASS = 'min-w-0 flex-1 gap-[2px]';
const SOURCE_TITLE_CLASS = 'text-[13px] font-bold leading-[18px] text-app-primary';
const SOURCE_SUMMARY_CLASS = 'text-[12px] leading-[17px] text-app-secondary';
const SOURCE_DETAILS_CLASS = 'gap-[9px] border-t border-app-line bg-app-background px-app-md py-[10px]';
const META_LABEL_CLASS = 'text-[11px] font-bold leading-[15px] text-app-success';
const META_VALUE_CLASS = 'font-mono text-[11px] leading-[16px] text-app-secondary';
const CHUNK_LIST_CLASS = 'gap-[7px]';
const CHUNK_CARD_CLASS = 'gap-[5px] rounded-app-sm bg-app-surface-muted px-[10px] py-[9px]';
const CHUNK_TITLE_CLASS = 'text-[12px] font-bold leading-[17px] text-app-primary';
const CHUNK_CONTENT_CLASS = 'text-[12px] leading-[18px] text-app-secondary';
const CHUNK_META_CLASS = 'font-mono text-[10px] leading-[15px] text-app-tertiary';
const NOTICE_CLASS = 'rounded-app-sm bg-app-surface-muted px-[10px] py-[9px]';
const ERROR_NOTICE_CLASS = 'rounded-app-sm border border-app-danger-line bg-app-danger-soft px-[10px] py-[9px]';
const ERROR_TEXT_CLASS = 'text-[12px] font-semibold leading-[18px] text-app-danger';
const MORE_BUTTON_CLASS =
  'min-h-[34px] items-center justify-center rounded-app-sm bg-app-surface-muted px-app-md active:opacity-[0.72]';
const MORE_TEXT_CLASS = 'text-[12px] font-bold leading-[17px] text-app-secondary';

function sourceKey(source: ChatTimelineSource, index: number): string {
  return `${index}:${source.id}`;
}

function sourceTitle(source: ChatTimelineSource): string {
  return source.title || source.name || source.id;
}

function sourceUrl(source: ChatTimelineSource): string {
  return source.url || source.link || '';
}

function chunkTitle(chunk: ChatTimelineSourceChunk, fallback: string): string {
  return chunk.heading || chunk.path || chunk.chunkId || fallback;
}

function formatRange(start: number | undefined, end: number | undefined): string {
  if (start === undefined) {
    return '';
  }
  return end !== undefined && end !== start ? `${start}-${end}` : String(start);
}

function formatChunkLocator(
  chunk: ChatTimelineSourceChunk,
  labels: {
    line: string;
    page: string;
    slide: string;
  }
): string {
  const line = formatRange(chunk.startLine, chunk.endLine);
  if (line) {
    return `${labels.line} ${line}`;
  }
  const page = formatRange(chunk.pageStart, chunk.pageEnd);
  if (page) {
    return `${labels.page} ${page}`;
  }
  const slide = formatRange(chunk.slideStart, chunk.slideEnd);
  return slide ? `${labels.slide} ${slide}` : '';
}

const SourceChunkCard = memo(function SourceChunkCard({
  chunk,
  fallbackTitle
}: {
  chunk: ChatTimelineSourceChunk;
  fallbackTitle: string;
}) {
  const t = useT();
  const locator = formatChunkLocator(chunk, {
    line: t('timeline.source.line'),
    page: t('timeline.source.page'),
    slide: t('timeline.source.slide')
  });
  const metadata = [
    locator,
    chunk.score !== undefined ? t('timeline.source.score', { score: chunk.score.toFixed(3) }) : '',
    chunk.sourceType,
    chunk.matchType
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className={CHUNK_CARD_CLASS}>
      <Text allowFontScaling={false} selectable className={CHUNK_TITLE_CLASS}>
        {chunkTitle(chunk, fallbackTitle)}
      </Text>
      {chunk.content ? (
        <Text allowFontScaling={false} selectable className={CHUNK_CONTENT_CLASS}>
          {chunk.content}
        </Text>
      ) : null}
      {metadata ? (
        <Text allowFontScaling={false} selectable className={CHUNK_META_CLASS}>
          {metadata}
        </Text>
      ) : null}
    </View>
  );
});

const SourceCard = memo(function SourceCard({
  source,
  sourceKeyValue,
  expanded,
  visibleChunkCount,
  onToggle,
  onShowMoreChunks
}: {
  source: ChatTimelineSource;
  sourceKeyValue: string;
  expanded: boolean;
  visibleChunkCount: number;
  onToggle: (key: string) => void;
  onShowMoreChunks: () => void;
}) {
  const t = useT();
  const url = sourceUrl(source);
  const chunks = source.chunks.slice(0, visibleChunkCount);
  const firstSnippet = source.chunks.find((chunk) => chunk.content)?.content || '';
  const summary = [
    source.collectionName,
    t('timeline.source.chunkCount', { count: source.chunks.length }),
    firstSnippet
  ]
    .filter(Boolean)
    .join(' · ');
  const handleToggle = useCallback(() => onToggle(sourceKeyValue), [onToggle, sourceKeyValue]);

  return (
    <View className={SOURCE_CARD_CLASS}>
      <Pressable
        accessibilityLabel={expanded ? t('timeline.source.collapseSource') : t('timeline.source.expandSource')}
        accessibilityRole="button"
        onPress={handleToggle}
        className={SOURCE_CARD_HEADER_CLASS}
      >
        <View className={SOURCE_CARD_HEADING_CLASS}>
          <Text allowFontScaling={false} numberOfLines={1} className={SOURCE_TITLE_CLASS}>
            {sourceTitle(source)}
          </Text>
          {summary ? (
            <Text allowFontScaling={false} numberOfLines={2} className={SOURCE_SUMMARY_CLASS}>
              {summary}
            </Text>
          ) : null}
        </View>
        <View className={FOLD_CLASS}>
          <AppIcon usage={expanded ? 'runtime.collapse' : 'runtime.expand'} />
        </View>
      </Pressable>

      {expanded ? (
        <View className={SOURCE_DETAILS_CLASS}>
          {url ? (
            <View>
              <Text allowFontScaling={false} className={META_LABEL_CLASS}>
                {t('timeline.source.url')}
              </Text>
              <Text allowFontScaling={false} selectable className={META_VALUE_CLASS}>
                {url}
              </Text>
            </View>
          ) : null}
          <View>
            <Text allowFontScaling={false} className={META_LABEL_CLASS}>
              {t('timeline.source.metadata')}
            </Text>
            <Text allowFontScaling={false} selectable className={META_VALUE_CLASS}>
              {[
                source.collectionName,
                source.collectionId,
                source.id,
                t('timeline.source.chunkCount', { count: source.chunks.length })
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {chunks.length > 0 ? (
            <View className={CHUNK_LIST_CLASS}>
              {chunks.map((chunk, chunkIndex) => (
                <SourceChunkCard
                  key={`${chunk.chunkId}:${chunkIndex}`}
                  chunk={chunk}
                  fallbackTitle={t('timeline.source.chunkLabel', {
                    index: chunk.index || chunkIndex + 1
                  })}
                />
              ))}
              {visibleChunkCount < source.chunks.length ? (
                <Pressable accessibilityRole="button" onPress={onShowMoreChunks} className={MORE_BUTTON_CLASS}>
                  <Text allowFontScaling={false} className={MORE_TEXT_CLASS}>
                    {t('timeline.source.showMoreChunks', {
                      count: Math.min(CHUNK_PAGE_SIZE, source.chunks.length - visibleChunkCount)
                    })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text allowFontScaling={false} className={STATUS_CLASS}>
              {t('timeline.source.noChunks')}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
});

export const SourceTimelineRow = memo(function SourceTimelineRow({
  node,
  isLastInRun,
  getInitialExpanded,
  onExpandedChange
}: SourceTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const [expanded, setExpanded] = useState(() => getInitialExpanded(node.id, false));
  const [visibleSourceCount, setVisibleSourceCount] = useState(SOURCE_PAGE_SIZE);
  const [expandedSourceKey, setExpandedSourceKey] = useState('');
  const [visibleChunkCount, setVisibleChunkCount] = useState(CHUNK_PAGE_SIZE);

  useEffect(() => {
    setExpanded(getInitialExpanded(node.id, false));
    setVisibleSourceCount(SOURCE_PAGE_SIZE);
    setExpandedSourceKey('');
    setVisibleChunkCount(CHUNK_PAGE_SIZE);
  }, [getInitialExpanded, node.id]);

  const hasError = Boolean(node.errorDetail);
  const errorMessage = node.errorDetail?.message || node.errorDetail?.code || t('timeline.source.error');
  const isEmpty = node.sources.length === 0 && !hasError && !node.malformed;
  const canExpand = node.sources.length > 0 || hasError || node.malformed;
  const visibleSources = useMemo(() => node.sources.slice(0, visibleSourceCount), [node.sources, visibleSourceCount]);

  const handleToggle = useCallback(() => {
    if (!canExpand) {
      return;
    }
    setExpanded((current) => {
      const next = !current;
      onExpandedChange(node.id, next);
      return next;
    });
  }, [canExpand, node.id, onExpandedChange]);

  const handleSourceToggle = useCallback((key: string) => {
    setExpandedSourceKey((current) => (current === key ? '' : key));
    setVisibleChunkCount(CHUNK_PAGE_SIZE);
  }, []);
  const handleShowMoreChunks = useCallback(() => {
    setVisibleChunkCount((current) => current + CHUNK_PAGE_SIZE);
  }, []);

  return (
    <View className={ROW_CLASS}>
      <ChatTimelineRail
        iconUsage="runtime.source"
        terminal={isLastInRun}
        toneColor={hasError ? theme.colors.danger : theme.colors.success}
      />
      <View className={BODY_CLASS}>
        <Pressable
          accessibilityLabel={expanded ? t('timeline.source.collapse') : t('timeline.source.expand')}
          accessibilityRole="button"
          disabled={!canExpand}
          onPress={handleToggle}
          className={HEADER_CLASS}
        >
          <View className={HEADER_LEADING_CLASS}>
            <Text allowFontScaling={false} className={TITLE_CLASS}>
              {t('timeline.source.title', { count: node.sourceCount })}
            </Text>
            {node.query ? (
              <Text allowFontScaling={false} numberOfLines={2} className={QUERY_CLASS}>
                {t('timeline.source.query', { query: node.query })}
              </Text>
            ) : null}
            <Text allowFontScaling={false} numberOfLines={1} className={QUERY_CLASS}>
              {[node.sourceKind, t('timeline.source.chunkCount', { count: node.chunkCount })]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {canExpand ? (
            <View className={FOLD_CLASS}>
              <AppIcon usage={expanded ? 'runtime.collapse' : 'runtime.expand'} />
            </View>
          ) : null}
        </Pressable>

        {isEmpty ? (
          <Text allowFontScaling={false} className={STATUS_CLASS}>
            {t('timeline.source.empty')}
          </Text>
        ) : hasError && !expanded ? (
          <Text allowFontScaling={false} numberOfLines={2} className={ERROR_STATUS_CLASS}>
            {errorMessage}
          </Text>
        ) : null}

        {expanded ? (
          <View className={SOURCE_LIST_CLASS}>
            {hasError ? (
              <View className={ERROR_NOTICE_CLASS}>
                <Text allowFontScaling={false} selectable className={ERROR_TEXT_CLASS}>
                  {errorMessage}
                </Text>
              </View>
            ) : null}
            {node.malformed ? (
              <View className={NOTICE_CLASS}>
                <Text allowFontScaling={false} className={STATUS_CLASS}>
                  {t('timeline.source.partialData')}
                </Text>
              </View>
            ) : null}
            {visibleSources.map((source, index) => {
              const key = sourceKey(source, index);
              return (
                <SourceCard
                  key={key}
                  source={source}
                  sourceKeyValue={key}
                  expanded={expandedSourceKey === key}
                  visibleChunkCount={expandedSourceKey === key ? visibleChunkCount : CHUNK_PAGE_SIZE}
                  onToggle={handleSourceToggle}
                  onShowMoreChunks={handleShowMoreChunks}
                />
              );
            })}
            {visibleSourceCount < node.sources.length ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setVisibleSourceCount((current) => current + SOURCE_PAGE_SIZE)}
                className={MORE_BUTTON_CLASS}
              >
                <Text allowFontScaling={false} className={MORE_TEXT_CLASS}>
                  {t('timeline.source.showMoreSources', {
                    count: Math.min(SOURCE_PAGE_SIZE, node.sources.length - visibleSourceCount)
                  })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});
