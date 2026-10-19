import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { buildChatTimelineUsageSummary } from '../../src/features/chatTimeline/usageSummary.ts';
import type { ChatTimelineUsageStats, ChatTimelineUsageSummary } from '../../src/features/chatTimeline/types.ts';
import * as formatters from '../../src/features/chatPersistence/chatDetailFormatters.ts';
import * as composition from '../../src/features/chatPersistence/chatUsageComposition.ts';
import { normalizeChatReasoningEffort } from '../../src/features/chatPersistence/agentModelSettings.ts';
import { createTranslator } from '../../src/shared/i18n/translate.ts';
import { appThemeTokens, appVisualTokens } from '../../src/shared/visual/foundation.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const USAGE_BADGE_SOURCE = readFileSync('src/features/chatPersistence/components/ChatUsageHeaderBadge.tsx', 'utf8');
const EN_MESSAGES_SOURCE = readFileSync('src/shared/i18n/messages/en-US.ts', 'utf8');
const ZH_MESSAGES_SOURCE = readFileSync('src/shared/i18n/messages/zh-CN.ts', 'utf8');

test('usage section header keeps PC metric order and wraps without measurement state', () => {
  const labelIndexes = [
    "label: t('usage.metric.firstTokenLatency')",
    "label: t('usage.metric.outputTokensPerSecond')",
    "label: t('usage.call.llm')",
    "label: t('usage.call.tool')"
  ].map((label) => USAGE_BADGE_SOURCE.indexOf(label));

  assert.ok(labelIndexes.every((index) => index >= 0));
  assert.deepEqual(
    labelIndexes,
    [...labelIndexes].sort((left, right) => left - right)
  );
  assert.match(USAGE_BADGE_SOURCE, /USAGE_CALL_COUNTS_CLASS[\s\S]*flex-row flex-wrap justify-end/u);
  assert.match(USAGE_BADGE_SOURCE, /resolveChatUsageToolCallCount\(stats\)/u);
  assert.match(USAGE_BADGE_SOURCE, /usageSummary\.compact[\s\S]*showTiming=\{false\}/u);
  assert.doesNotMatch(USAGE_BADGE_SOURCE, /onLayout|useWindowDimensions|Dimensions\.addEventListener/u);
});

test('usage timing and tool labels stay aligned in Chinese and English', () => {
  assert.match(ZH_MESSAGES_SOURCE, /'usage\.metric\.firstTokenLatency': '首字延迟'/u);
  assert.match(ZH_MESSAGES_SOURCE, /'usage\.metric\.outputTokensPerSecond': '输出速度'/u);
  assert.match(ZH_MESSAGES_SOURCE, /'usage\.call\.tool': '工具调用'/u);
  assert.match(EN_MESSAGES_SOURCE, /'usage\.metric\.firstTokenLatency': 'First token'/u);
  assert.match(EN_MESSAGES_SOURCE, /'usage\.metric\.outputTokensPerSecond': 'Output speed'/u);
  assert.match(EN_MESSAGES_SOURCE, /'usage\.call\.tool': 'Tool calls'/u);
});

const summary = buildChatTimelineUsageSummary(
  {
    model: { key: 'test-model' },
    contextWindow: { currentSize: 1000, maxSize: 10000 },
    usage: {
      current: {
        promptTokens: 6000,
        completionTokens: 4000,
        totalTokens: 10000,
        completionTokensDetails: { reasoningTokens: 800 },
        promptTokensDetails: { cacheHitTokens: 1500, cacheMissTokens: 4500 },
        timing: { firstTokenLatencyMs: 2300, generationDurationMs: 2000 },
        llmChatCompletionCount: 2,
        toolCallCount: 1
      }
    }
  },
  1
);

test('usage composition splits reasoning from output and uses the correct denominators', () => {
  const values = composition.buildChatUsageComposition(summary.current);
  assert.equal(values.output, 3200);
  assert.deepEqual(
    composition.resolveChatUsageCompositionPercents([values.prompt, values.output, values.reasoning], values.total),
    [
      { percent: 60, width: 60 },
      { percent: 32, width: 32 },
      { percent: 8, width: 8 }
    ]
  );
  assert.deepEqual(
    composition.resolveChatUsageCompositionPercents([values.cacheHit, values.cacheMiss], values.prompt),
    [
      { percent: 25, width: 25 },
      { percent: 75, width: 75 }
    ]
  );
  for (const [percent, expected] of [
    [0, '0%'],
    [0.001, '<0.01%'],
    [0.1, '0.1%'],
    [52.244, '52.24%'],
    [120, '>100%'],
    [null, null]
  ] as const) {
    assert.equal(composition.formatChatUsageCompositionPercent(percent), expected);
  }
});

test('usage composition preserves unknowns, zeroes and inconsistent counts without overflowing', () => {
  assert.deepEqual(composition.buildChatUsageComposition(undefined), {
    total: null,
    prompt: null,
    output: null,
    reasoning: null,
    cacheHit: null,
    cacheMiss: null
  });
  assert.equal(composition.buildChatUsageComposition({ ...summary.current, reasoningTokens: null }).output, null);
  assert.equal(composition.buildChatUsageComposition({ ...summary.current, reasoningTokens: 4001 }).output, null);
  assert.equal(composition.buildChatUsageComposition({ ...summary.current, reasoningTokens: 0 }).output, 4000);
  const invalid = composition.buildChatUsageComposition({
    ...summary.current,
    promptTokens: -1,
    totalTokens: Infinity,
    cacheHitTokens: NaN
  });
  assert.equal(invalid.prompt, null);
  assert.equal(invalid.total, null);
  assert.equal(invalid.cacheHit, null);
  assert.deepEqual(composition.resolveChatUsageCompositionPercents([0, null], 0), [
    { percent: null, width: 0 },
    { percent: null, width: 0 }
  ]);
  assert.deepEqual(composition.resolveChatUsageCompositionPercents([80, 30], 100), [
    { percent: 80, width: 0 },
    { percent: 30, width: 0 }
  ]);
  assert.equal(composition.resolveChatUsageCompositionPercents([101], 100)[0].width, 0);
});

test('incomplete usage cannot invent a total or a full input composition', () => {
  const partial = buildChatTimelineUsageSummary({ usage: { current: { promptTokens: 1200 } } }, 1);
  assert.equal(partial.current.totalTokens, null);
  const values = composition.buildChatUsageComposition(partial.current);
  assert.deepEqual(composition.resolveChatUsageCompositionPercents([values.prompt], values.total), [
    { percent: null, width: 0 }
  ]);
  const complete = buildChatTimelineUsageSummary(
    {
      usage: { current: { promptTokens: 1200, completionTokens: 0 } }
    },
    1
  );
  assert.equal(complete.current.totalTokens, 1200);
  const reported = buildChatTimelineUsageSummary(
    {
      usage: { current: { promptTokens: 1200, totalTokens: 2000 } }
    },
    1
  );
  assert.equal(reported.current.totalTokens, 2000);
});

type BadgeProps = {
  usageSummary: ChatTimelineUsageSummary;
  modelKey: null;
  reasoningEffort: null;
};

function loadUsageComponents(locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  const t = createTranslator(locale);
  const require = createRequire(import.meta.url);
  class AnimatedValue {
    constructor(public value: number) {}
    setValue(value: number) {
      this.value = value;
    }
  }
  const deps: Record<string, unknown> = {
    'react-native': {
      View: 'View',
      Text: 'Text',
      Pressable: 'Button',
      ScrollView: 'ScrollView',
      Modal: 'Modal',
      Keyboard: { dismiss() {} },
      Animated: {
        View: 'AnimatedView',
        Value: AnimatedValue,
        timing: () => ({}),
        spring: () => ({}),
        parallel: () => ({
          start: (done?: (result: { finished: boolean }) => void) => done?.({ finished: true }),
          stop() {}
        })
      }
    },
    'react-native-svg': { Svg: 'Svg', Circle: 'Circle' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 23 }) },
    '../../../shared/i18n': { useT: () => t, useI18n: () => ({ t, locale }) },
    '../../../shared/icons/AppIcon': { AppIcon: 'Icon' },
    '../../../shared/icons/AppIconButton': {
      AppIconButton: (props: object) => React.createElement('Button', props)
    },
    '../../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: appThemeTokens.light }) },
    '../../../shared/visual/foundation': { appVisualTokens },
    '../agentModelSettings.ts': { normalizeChatReasoningEffort },
    '../chatDetailFormatters.ts': formatters,
    '../chatUsageComposition.ts': composition
  };
  function load<T>(name: string): T {
    const source = readFileSync(`src/features/chatPersistence/components/${name}.tsx`, 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(
      (key: string) => deps[key] ?? require(key),
      module,
      module.exports
    );
    return module.exports as T;
  }
  const stacked = load<{ ChatUsageStackedMetrics: React.ComponentType<{ stats: ChatTimelineUsageStats }> }>(
    'ChatUsageStackedMetrics'
  );
  deps['./ChatUsageStackedMetrics'] = stacked;
  return {
    ...stacked,
    ...load<{ ChatUsageHeaderBadge: React.ComponentType<BadgeProps> }>('ChatUsageHeaderBadge')
  };
}

function segmentWidths(root: ReactTestInstance) {
  return root
    .findAll((node) => node.type === 'View' && typeof node.props.style?.width === 'string')
    .map((node) => node.props.style.width);
}

function textContent(root: ReactTestInstance): string {
  return root.children.map((child) => (typeof child === 'string' ? child : textContent(child))).join('');
}

test('one toggle switches all sections, retains raw output, accepts live updates and survives reopening', async () => {
  const { ChatUsageHeaderBadge } = loadUsageComponents();
  const data = { ...summary, run: summary.current, chat: summary.current, compact: summary.current };
  const props: BadgeProps = { usageSummary: data, modelKey: null, reasoningEffort: null };
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(React.createElement(ChatUsageHeaderBadge, props));
    });
    await act(async () => {
      renderer!.root.findAllByType('Button')[0].props.onPress();
    });
    assert.deepEqual(segmentWidths(renderer!.root), Array(4).fill(['60%', '32%', '8%', '25%', '75%']).flat());
    const toggle = () =>
      renderer!.root.findAllByType('Button').find((button) => button.props.usage === 'usage.toggleMode')!;
    assert.equal(
      renderer!.root.findAllByType('Button').filter((button) => button.props.usage === 'usage.toggleMode').length,
      1
    );
    assert.equal(toggle().props.accessibilityLabel, '切换为数值展示');
    await act(async () => toggle().props.onPress());
    assert.deepEqual(segmentWidths(renderer!.root), []);
    assert.equal(toggle().props.accessibilityLabel, '切换为进度条展示');
    assert.equal(renderer!.root.findAllByType('Text').filter((node) => textContent(node) === '4,000').length, 4);
    assert.ok(textContent(renderer!.root).includes('首字延迟 2.3s'));
    assert.ok(textContent(renderer!.root).includes('输出速度 2000.0/s'));
    assert.ok(textContent(renderer!.root).includes('工具调用 1'));

    const updated = { ...data, current: { ...data.current, completionTokens: 5000, totalTokens: 11000 } };
    await act(async () => {
      renderer!.update(React.createElement(ChatUsageHeaderBadge, { ...props, usageSummary: updated }));
    });
    assert.ok(textContent(renderer!.root).includes('5,000'));
    await act(async () => {
      renderer!.root
        .findAllByType('Button')
        .find((button) => button.props.accessibilityLabel === '关闭用量统计')!
        .props.onPress();
    });
    assert.equal(renderer!.root.findAllByType('Modal').length, 0);
    await act(async () => {
      renderer!.root.findAllByType('Button')[0].props.onPress();
    });
    assert.equal(toggle().props.accessibilityLabel, '切换为进度条展示');
    await act(async () => toggle().props.onPress());
    assert.equal(segmentWidths(renderer!.root).length, 20);
    assert.equal(segmentWidths(renderer!.root)[1], `${(4200 / 11000) * 100}%`);
    await act(async () => {
      renderer!.update(React.createElement(ChatUsageHeaderBadge, { ...props, key: 'next-conversation' }));
    });
    await act(async () => {
      renderer!.root.findAllByType('Button')[0].props.onPress();
    });
    assert.equal(toggle().props.accessibilityLabel, '切换为数值展示');
  } finally {
    await act(async () => renderer?.unmount());
  }
});

test('English composition exposes exact counts and renders missing details without invented segments', async () => {
  const { ChatUsageStackedMetrics } = loadUsageComponents('en-US');
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(React.createElement(ChatUsageStackedMetrics, { stats: summary.current }));
    });
    const groups = renderer!.root.findAll((node) => node.type === 'View' && node.props.accessible);
    assert.match(groups[0].props.accessibilityLabel, /Output excluding reasoning: 3,200/u);
    assert.match(groups[1].props.accessibilityLabel, /Cache hit: 1,500/u);
    assert.match(groups[1].props.accessibilityLabel, /Cache miss: 4,500/u);
    assert.equal(textContent(renderer!.root).includes('Cache miss'), false);
    await act(async () =>
      renderer!.update(
        React.createElement(ChatUsageStackedMetrics, {
          stats: { ...summary.run, promptTokens: 1200 }
        })
      )
    );
    assert.deepEqual(segmentWidths(renderer!.root), ['0%', '0%', '0%', '0%', '0%']);
    assert.ok(textContent(renderer!.root).includes('1,200'));
    assert.ok(textContent(renderer!.root).includes('Reasoning-'));
  } finally {
    await act(async () => renderer?.unmount());
  }
});
