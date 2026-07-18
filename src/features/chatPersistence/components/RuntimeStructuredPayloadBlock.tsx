import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT, type I18nKey, type TFunction } from '../../../shared/i18n';
import { cn } from '../../../shared/visual/className';
import {
  buildRuntimeStructuredPayload,
  RUNTIME_STRUCTURED_LEAF_INITIAL_CHARS,
  RUNTIME_TEXT_INITIAL_CHARS,
  RUNTIME_TEXT_PAGE_CHARS,
  type RuntimeStructuredPayloadNode,
  type RuntimeStructuredPayloadTone,
  type RuntimeStructuredPayloadView
} from './runtimeStructuredPayload.ts';

type RuntimeStructuredPayloadBlockProps = {
  role: 'args' | 'result';
  sourceText: string;
  status?: string;
  wrap: boolean;
};

const LEAF_VALUE_CLASS_BY_TONE = {
  string: 'text-app-primary',
  number: 'text-app-brand-blue-strong',
  boolean: 'text-app-warning',
  null: 'text-app-tertiary',
  redacted: 'font-bold text-app-danger',
  notice: 'italic text-app-tertiary'
} as const;

const PAYLOAD_CONTAINER_CLASS_BY_TONE: Record<RuntimeStructuredPayloadTone, string> = {
  neutral: '',
  code: 'rounded-app-sm bg-app-surface-muted px-[8px] py-[7px]',
  patch: 'rounded-app-sm border-l-2 border-app-success bg-app-surface-muted px-[8px] py-[7px]',
  error: 'rounded-app-sm border border-app-danger-line bg-app-danger-soft px-[8px] py-[7px]'
};

function noticeText(node: Extract<RuntimeStructuredPayloadNode, { kind: 'leaf' }>, t: TFunction): string {
  const count = node.hiddenCount || 0;
  const key: I18nKey =
    node.notice === 'circular'
      ? 'runtime.structured.circular'
      : node.notice === 'max_depth'
        ? 'runtime.structured.maxDepth'
        : node.notice === 'max_nodes'
          ? 'runtime.structured.maxNodes'
          : 'runtime.structured.moreChildren';
  return t(key, { count });
}

function StructuredLeafRow({ label, valueClass, valueText }: { label: string; valueClass: string; valueText: string }) {
  return (
    <View className={LEAF_ROW_CLASS}>
      {label ? (
        <Text allowFontScaling={false} selectable className={KEY_CLASS}>
          {label}
          {':'}
        </Text>
      ) : null}
      <Text allowFontScaling={false} selectable className={cn(VALUE_CLASS, valueClass)}>
        {valueText}
      </Text>
    </View>
  );
}

function TranslatedStructuredLeaf({
  node,
  valueClass
}: {
  node: Extract<RuntimeStructuredPayloadNode, { kind: 'leaf' }>;
  valueClass: string;
}) {
  const t = useT();
  const valueText = node.tone === 'redacted' ? t('runtime.structured.redacted') : noticeText(node, t);
  return <StructuredLeafRow label={node.label} valueClass={valueClass} valueText={valueText} />;
}

function LongStructuredLeaf({
  node,
  valueClass
}: {
  node: Extract<RuntimeStructuredPayloadNode, { kind: 'leaf' }>;
  valueClass: string;
}) {
  const t = useT();
  const valueText = node.valueText;
  const [visibleChars, setVisibleChars] = useState(() =>
    Math.min(RUNTIME_STRUCTURED_LEAF_INITIAL_CHARS, valueText.length)
  );

  useEffect(() => {
    setVisibleChars(Math.min(RUNTIME_STRUCTURED_LEAF_INITIAL_CHARS, valueText.length));
  }, [node.id, valueText]);

  const showCount = Math.min(RUNTIME_TEXT_PAGE_CHARS, valueText.length - visibleChars);
  const canCollapse = valueText.length > RUNTIME_STRUCTURED_LEAF_INITIAL_CHARS && showCount === 0;
  const handleShowMore = useCallback(() => {
    setVisibleChars((value) => Math.min(value + RUNTIME_TEXT_PAGE_CHARS, valueText.length));
  }, [valueText.length]);
  const handleCollapse = useCallback(
    () => setVisibleChars(Math.min(RUNTIME_STRUCTURED_LEAF_INITIAL_CHARS, valueText.length)),
    [valueText.length]
  );

  return (
    <View className={LEAF_CLASS}>
      <StructuredLeafRow label={node.label} valueClass={valueClass} valueText={valueText.slice(0, visibleChars)} />
      {showCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={handleShowMore} className={LEAF_ACTION_CLASS}>
          <Text allowFontScaling={false} className={LEAF_ACTION_TEXT_CLASS}>
            {t('runtime.structured.showMore', { count: showCount })}
          </Text>
        </Pressable>
      ) : canCollapse ? (
        <Pressable accessibilityRole="button" onPress={handleCollapse} className={LEAF_ACTION_CLASS}>
          <Text allowFontScaling={false} className={LEAF_ACTION_TEXT_CLASS}>
            {t('runtime.structured.collapseLongText')}
          </Text>
        </Pressable>
      ) : null}
      {node.truncated && showCount === 0 ? (
        <Text allowFontScaling={false} className={NOTICE_CLASS}>
          {t('runtime.structured.fieldRenderLimit', { count: valueText.length })}
        </Text>
      ) : null}
    </View>
  );
}

function StructuredLeaf({
  node,
  payloadTone
}: {
  node: Extract<RuntimeStructuredPayloadNode, { kind: 'leaf' }>;
  payloadTone: RuntimeStructuredPayloadTone;
}) {
  const valueClass =
    payloadTone === 'error'
      ? 'font-semibold text-app-danger'
      : payloadTone === 'patch'
        ? 'text-app-success'
        : LEAF_VALUE_CLASS_BY_TONE[node.tone];

  if (node.tone === 'redacted' || node.tone === 'notice') {
    return <TranslatedStructuredLeaf node={node} valueClass={valueClass} />;
  }
  return node.tone === 'string' && (node.valueText.length > RUNTIME_STRUCTURED_LEAF_INITIAL_CHARS || node.truncated) ? (
    <LongStructuredLeaf node={node} valueClass={valueClass} />
  ) : (
    <StructuredLeafRow label={node.label} valueClass={valueClass} valueText={node.valueText} />
  );
}

function StructuredBranch({
  node,
  payloadTone,
  root = false
}: {
  node: Extract<RuntimeStructuredPayloadNode, { kind: 'branch' }>;
  payloadTone: RuntimeStructuredPayloadTone;
  root?: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(root);
  const handleToggle = useCallback(() => setExpanded((value) => !value), []);
  const summary = node.containerKind === 'array' ? `[${node.childCount}]` : `{${node.childCount}}`;

  return (
    <View className={BRANCH_CLASS}>
      {!root ? (
        <Pressable
          accessibilityLabel={expanded ? t('timeline.collapseContent') : t('timeline.expandContent')}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={handleToggle}
          className={BRANCH_HEADER_CLASS}
        >
          <AppIcon usage={expanded ? 'runtime.collapse' : 'runtime.expand'} />
          <Text allowFontScaling={false} selectable className={KEY_CLASS}>
            {node.label}
          </Text>
          <Text allowFontScaling={false} className={BRANCH_SUMMARY_CLASS}>
            {summary}
          </Text>
        </Pressable>
      ) : null}

      {expanded ? (
        <View className={root ? ROOT_CHILDREN_CLASS : BRANCH_CHILDREN_CLASS}>
          {node.children.map((child) => (
            <StructuredNode key={child.id} node={child} payloadTone={payloadTone} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StructuredNode({
  node,
  payloadTone
}: {
  node: RuntimeStructuredPayloadNode;
  payloadTone: RuntimeStructuredPayloadTone;
}) {
  return node.kind === 'branch' ? (
    <StructuredBranch node={node} payloadTone={payloadTone} />
  ) : (
    <StructuredLeaf node={node} payloadTone={payloadTone} />
  );
}

function TreePayload({ view }: { view: Extract<RuntimeStructuredPayloadView, { kind: 'tree' }> }) {
  return (
    <View className={cn(TREE_CLASS, PAYLOAD_CONTAINER_CLASS_BY_TONE[view.tone])}>
      {view.root.kind === 'branch' ? (
        <StructuredBranch root node={view.root} payloadTone={view.tone} />
      ) : (
        <StructuredLeaf node={view.root} payloadTone={view.tone} />
      )}
    </View>
  );
}

function TextPayload({
  sourceKey,
  view,
  wrap
}: {
  sourceKey: string;
  view: Extract<RuntimeStructuredPayloadView, { kind: 'text' }>;
  wrap: boolean;
}) {
  const t = useT();
  const [visibleChars, setVisibleChars] = useState(() => Math.min(RUNTIME_TEXT_INITIAL_CHARS, view.text.length));

  useEffect(() => {
    setVisibleChars(Math.min(RUNTIME_TEXT_INITIAL_CHARS, view.text.length));
  }, [sourceKey, view.text.length]);

  const showCount = Math.min(RUNTIME_TEXT_PAGE_CHARS, view.text.length - visibleChars);
  const handleShowMore = useCallback(() => {
    setVisibleChars((value) => Math.min(value + RUNTIME_TEXT_PAGE_CHARS, view.text.length));
  }, [view.text.length]);

  return (
    <View className={cn(TEXT_PAYLOAD_CLASS, PAYLOAD_CONTAINER_CLASS_BY_TONE[view.tone])}>
      {view.structuredTooLarge ? (
        <Text allowFontScaling={false} className={NOTICE_CLASS}>
          {t('runtime.structured.tooLarge')}
        </Text>
      ) : null}
      <Text
        allowFontScaling={false}
        selectable
        className={cn(TEXT_CLASS, view.tone === 'error' ? TEXT_ERROR_CLASS : null, !wrap ? NOWRAP_CLASS : null)}
      >
        {view.text.slice(0, visibleChars)}
      </Text>
      {showCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={handleShowMore} className={SHOW_MORE_BUTTON_CLASS}>
          <Text allowFontScaling={false} className={SHOW_MORE_TEXT_CLASS}>
            {t('runtime.structured.showMore', { count: showCount })}
          </Text>
        </Pressable>
      ) : view.truncated ? (
        <Text allowFontScaling={false} className={NOTICE_CLASS}>
          {t('runtime.structured.renderLimit', { count: view.text.length })}
        </Text>
      ) : null}
    </View>
  );
}

export const RuntimeStructuredPayloadBlock = memo(function RuntimeStructuredPayloadBlock({
  role,
  sourceText,
  status,
  wrap
}: RuntimeStructuredPayloadBlockProps) {
  const view = useMemo(() => buildRuntimeStructuredPayload(sourceText, { role, status }), [role, sourceText, status]);

  return view.kind === 'tree' ? (
    <TreePayload view={view} />
  ) : (
    <TextPayload sourceKey={sourceText} view={view} wrap={wrap} />
  );
});

const TREE_CLASS = 'min-w-0';
const ROOT_CHILDREN_CLASS = 'gap-[3px]';
const BRANCH_CLASS = 'min-w-0 gap-[3px]';
const BRANCH_HEADER_CLASS = 'min-h-[24px] min-w-0 flex-row items-center gap-[3px]';
const BRANCH_CHILDREN_CLASS = 'ml-[7px] gap-[3px] border-l border-app-line pl-[10px]';
const BRANCH_SUMMARY_CLASS = 'font-mono text-[11px] leading-4 text-app-tertiary';
const LEAF_CLASS = 'min-w-0 gap-[4px]';
const LEAF_ROW_CLASS = 'min-h-[20px] min-w-0 flex-row items-start gap-[6px]';
const LEAF_ACTION_CLASS = 'ml-[18px] self-start px-[4px] py-[2px] active:opacity-[0.7]';
const LEAF_ACTION_TEXT_CLASS = 'text-[11px] font-bold leading-4 text-app-brand-blue-strong';
const KEY_CLASS = 'shrink-0 font-mono text-[12px] font-semibold leading-[18px] text-app-success';
const VALUE_CLASS = 'min-w-0 shrink font-mono text-[12px] leading-[18px]';
const TEXT_PAYLOAD_CLASS = 'min-w-0 gap-[6px]';
const TEXT_CLASS = 'font-mono text-[12px] leading-[18px] text-app-primary';
const TEXT_ERROR_CLASS = 'font-semibold text-app-danger';
const NOWRAP_CLASS = 'min-w-[680px]';
const NOTICE_CLASS = 'text-[11px] font-semibold leading-4 text-app-tertiary';
const SHOW_MORE_BUTTON_CLASS =
  'self-start rounded-app-sm bg-app-brand-blue-soft px-[8px] py-[5px] active:opacity-[0.7]';
const SHOW_MORE_TEXT_CLASS = 'text-[11px] font-bold leading-4 text-app-brand-blue-strong';
