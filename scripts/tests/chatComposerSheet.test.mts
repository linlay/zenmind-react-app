import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ChatConversationAwaitingState } from '../../src/features/chatRealtime/types';
import * as awaitingQuestionState from '../../src/features/chatPersistence/components/awaiting/awaitingQuestionState.ts';
import * as awaitingSubmitState from '../../src/features/chatPersistence/components/awaiting/awaitingSubmitState.ts';

const require = createRequire(import.meta.url);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Motion = { toValue: number; finish: () => void; stopped: boolean };
function loadSheet(os = 'android') {
  const motions: Motion[] = [];
  let handleBack: (() => boolean) | undefined;
  class Value {
    value: number;
    constructor(value: number) {
      this.value = value;
    }
    setValue(value: number) {
      this.value = value;
    }
    interpolate(config: unknown) {
      return { value: this, config };
    }
  }
  const deps: Record<string, unknown> = {
    'react-native': {
      View: 'View',
      Modal: 'Modal',
      Pressable: 'Pressable',
      ScrollView: 'ScrollView',
      Text: 'Text',
      TextInput: 'TextInput',
      KeyboardAvoidingView: 'KeyboardAvoidingView',
      Keyboard: { dismiss() {} },
      BackHandler: {
        addEventListener: (_event: string, handler: () => boolean) => {
          handleBack = handler;
          return { remove: () => { handleBack = undefined; } };
        }
      },
      Platform: { OS: os },
      useWindowDimensions: () => ({ width: 400, height: 800 }),
      Easing: { cubic: 'cubic', in: () => 'in', out: () => 'out' },
      Animated: {
        View: 'AnimatedView',
        Value,
        timing(value: Value, config: { toValue: number; useNativeDriver: boolean }) {
          assert.equal(config.useNativeDriver, true);
          let callback: ((result: { finished: boolean }) => void) | undefined;
          const motion: Motion = {
            toValue: config.toValue,
            stopped: false,
            finish() {
              if (motion.stopped) return;
              value.setValue(config.toValue);
              callback?.({ finished: true });
            }
          };
          motions.push(motion);
          return {
            start(cb: typeof callback) {
              callback = cb;
            },
            stop() {
              motion.stopped = true;
              callback?.({ finished: false });
            }
          };
        }
      }
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) },
    '@react-navigation/native': { useIsFocused: () => true },
    '../../../../shared/i18n': { useT: () => (key: string) => key },
    '../../../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: {} } }) },
    '../../../../shared/visual/className': { cn: (...classes: unknown[]) => classes.filter(Boolean).join(' ') },
    '../../../../shared/icons/AppIcon': { AppIcon: 'AppIcon' },
    '../../../../shared/components/conversationPreview/ConversationPreviewProvider': { useConversationPreviewActions: () => ({}) },
    '../../../../core/api/services/chatApi': {},
    '../../../chatRealtime/chatSyncService': {},
    '../../../chatTimeline/index.ts': { getAwaitingInteractiveTimeout: () => null },
    '../../cacheScope': {},
    './awaitingQuestionState': awaitingQuestionState,
    './awaitingSubmitState': awaitingSubmitState,
    './AwaitingDateTimeInput': {},
    './AwaitingFormPanel': {}
  };
  function load(name: string): Record<string, unknown> {
    const file = new URL(`../../src/features/chatPersistence/components/${name}.tsx`, import.meta.url);
    const transformed = transformSync(readFileSync(file, 'utf8'), {
      filename: file.pathname,
      configFile: false,
      babelrc: false,
      presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
      plugins: [
        ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
        '@babel/plugin-transform-modules-commonjs'
      ]
    });
    const module = { exports: {} };
    const components: Record<string, string> = {
      './ChatBottomSheet': 'ChatBottomSheet',
      '../ChatComposerSheet': 'ChatComposerSheet',
      './AwaitingPanelFooter': 'awaiting/AwaitingPanelFooter'
    };
    new Function('require', 'module', 'exports', transformed!.code!)(
      (key: string) => components[key] ? load(components[key]) : (deps[key] ?? require(key)),
      module,
      module.exports
    );
    return module.exports;
  }
  const module = { exports: load('ChatComposerSheet') };
  return {
    Sheet: (
      module.exports as {
        ChatComposerSheet: React.ComponentType<{
          visible: boolean;
          closeLabel: string;
          onClose: () => void;
          onDismiss: () => void;
          children?: React.ReactNode;
        }>;
      }
    ).ChatComposerSheet,
    motions,
    androidBack: () => handleBack?.(),
    load
  };
}

for (const os of ['android', 'ios']) {
  test(`${os}: backdrop stays fixed and content survives until the drawer finishes closing`, async () => {
    const { Sheet, motions } = loadSheet(os);
    let dismissed = 0,
      renderer!: ReactTestRenderer;
    const props = {
      visible: true,
      closeLabel: 'Close',
      onClose() {},
      onDismiss() {
        dismissed++;
      }
    };
    const render = (visible: boolean) =>
      React.createElement(
        Sheet,
        { ...props, visible },
        React.createElement('Content', { id: visible ? 'original' : 'discarded' })
      );
    await act(async () => {
      renderer = create(render(true));
    });
    try {
      const modal = () => renderer.root.findByType('Modal');
      assert.equal(modal().props.animationType, 'none');
      assert.equal(motions.length, 0, 'wait for native presentation and real sheet height');
      await act(async () => {
        modal().props.onShow();
        renderer.root.findAllByType('AnimatedView')[1].props.onLayout({ nativeEvent: { layout: { height: 320 } } });
      });
      const [backdrop, panel] = renderer.root.findAllByType('AnimatedView');
      assert.equal(backdrop.props.style.transform, undefined);
      assert.deepEqual(panel.props.style.at(-1).transform[0].translateY.config.outputRange, [320, 0]);
      assert.equal(motions.at(-1)!.toValue, 1);
      await act(async () => motions.at(-1)!.finish());
      await act(async () => renderer.update(render(false)));
      assert.equal(modal().props.visible, true, 'keep native modal mounted during exit');
      assert.equal(
        renderer.root.findByType('Content').props.id,
        'original',
        'do not swap closed-state content into exit'
      );
      assert.equal(renderer.root.findAllByType('AnimatedView')[1].props.pointerEvents, 'none');
      assert.equal(dismissed, 0);
      assert.equal(motions.at(-1)!.toValue, 0);
      await act(async () => motions.at(-1)!.finish());
      assert.equal(modal().props.visible, false);
      assert.equal(dismissed, os === 'ios' ? 0 : 1);
      await act(async () => modal().props.onDismiss());
      assert.equal(dismissed, 1, 'deferred actions fire once, after native dismissal');
    } finally {
      await act(async () => renderer.unmount());
    }
  });
}

test('rapid reopen cancels the pending exit and does not replay a pending dismissal', async () => {
  const { Sheet, motions } = loadSheet();
  let dismissed = 0,
    renderer!: ReactTestRenderer;
  const props = {
    closeLabel: 'Close',
    onClose() {},
    onDismiss() {
      dismissed++;
    }
  };
  const render = (visible: boolean) => React.createElement(Sheet, { ...props, visible }, 'contents');
  await act(async () => {
    renderer = create(render(true));
  });
  try {
    await act(async () => {
      renderer.root.findByType('Modal').props.onShow();
      renderer.root.findAllByType('AnimatedView')[1].props.onLayout({ nativeEvent: { layout: { height: 400 } } });
    });
    await act(async () => renderer.update(render(false)));
    const exit = motions.at(-1)!;
    await act(async () => renderer.update(render(true)));
    assert.equal(exit.stopped, true);
    await act(async () => exit.finish());
    assert.equal(renderer.root.findByType('Modal').props.visible, true);
    assert.equal(motions.at(-1)!.toValue, 1);
    assert.equal(dismissed, 0);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test('awaiting question, choices and free text survive collapsing and reopening the contained sheet', async () => {
  const { load, motions, androidBack } = loadSheet();
  const Dock = load('awaiting/ChatAwaitingDock').ChatAwaitingDock as React.ComponentType<{
    awaiting: ChatConversationAwaitingState;
    visible: boolean;
    onClose: () => void;
    onSubmit: () => Promise<void>;
  }>;
  const awaiting = {
    id: 'awaiting-node',
    awaitingId: 'awaiting-1',
    runId: 'run-1',
    status: 'ask',
    mode: 'question',
    createdAt: 1,
    updatedAt: 1,
    interactive: {
      kind: 'question',
      questions: [
        { id: 'first', type: 'multi-select', question: 'Topics', options: [{ label: 'Progress', value: 'progress' }] },
        { id: 'second', type: 'multi-select', question: 'Details', allowFreeText: true, options: [{ label: 'Risks', value: 'risks' }] }
      ]
    }
  } satisfies ChatConversationAwaitingState;
  let submitted = 0;
  function Example() {
    const [visible, setVisible] = React.useState(true);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement('Resume', { onPress: () => setVisible(true) }),
      React.createElement(Dock, {
        awaiting,
        visible,
        onClose: () => setVisible(false),
        async onSubmit() { submitted++; }
      })
    );
  }
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(Example)); });
  try {
    const button = (label: string) => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label)!;
    const choice = () => renderer.root.findAllByType('Pressable').find((node) => node.props.accessibilityState?.selected !== undefined)!;
    const rootOverlay = () => renderer.root.findAllByType('View').find((node) => node.props.importantForAccessibility)!;

    assert.equal(renderer.root.findAllByType('Modal').length, 0);
    await act(async () => {
      renderer.root.findAllByType('AnimatedView')[1].props.onLayout({ nativeEvent: { layout: { height: 320 } } });
    });
    assert.equal(motions.at(-1)!.toValue, 1);
    await act(async () => motions.at(-1)!.finish());
    await act(async () => choice().props.onPress());
    await act(async () => button('awaiting.continue').props.onPress());
    await act(async () => choice().props.onPress());
    await act(async () => renderer.root.findByType('TextInput').props.onChangeText('Context'));
    await act(async () => { assert.equal(androidBack(), true); });
    assert.equal(rootOverlay().props.pointerEvents, 'none');
    assert.equal(rootOverlay().props.importantForAccessibility, 'no-hide-descendants');
    assert.equal(motions.at(-1)!.toValue, 0);
    await act(async () => motions.at(-1)!.finish());
    assert.equal(rootOverlay().props.style.opacity, 0);
    assert.equal(androidBack(), undefined);
    await act(async () => renderer.root.findByType('Resume').props.onPress());
    assert.equal(motions.at(-1)!.toValue, 1);
    assert.ok(button('awaiting.submit'), 'last question stays active');
    assert.equal(choice().props.accessibilityState.selected, true);
    assert.equal(renderer.root.findByType('TextInput').props.value, 'Context');
    await act(async () => button('awaiting.previousQuestion').props.onPress());
    assert.equal(choice().props.accessibilityState.selected, true);
    assert.equal(submitted, 0);
  } finally {
    await act(async () => renderer.unmount());
  }
});
