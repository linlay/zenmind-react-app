import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {
  validateChatDerivationResponse,
  isDefinitiveChatDerivationRejection
} from '../../src/core/api/services/chatDerivationProtocol.ts';
const now = 1_791_450_000_000;
test('derivation acknowledgement verifies exact source/run/destination/owner and strict time; only definite creation rejections permit a fresh attempt', () => {
  const target = { chatId: 'child', phase: 'unknown' as const, teamId: 'team' };
  const response = {
    chatId: 'child',
    sourceChatId: 'source',
    sourceRunId: 'run',
    teamId: 'team',
    copiedRuns: 2,
    lastRunId: 'mapped-run',
    createdAt: now,
    updatedAt: now
  };
  validateChatDerivationResponse(response, 'source', 'run', target);
  for (const change of [
    { sourceRunId: 'other' },
    { sourceChatId: 'other' },
    { chatId: 'other' },
    { agentKey: 'member' },
    { copiedRuns: 0 },
    { copiedRuns: 1.5 },
    { lastRunId: '' },
    { createdAt: now / 1000 }
  ])
    assert.throws(
      () => validateChatDerivationResponse({ ...response, ...change }, 'source', 'run', target),
      /does not match/
    );
  assert.equal(isDefinitiveChatDerivationRejection(Object.assign(new Error('denied'), { status: 403 })), true);
  assert.equal(isDefinitiveChatDerivationRejection({ status: 409, data: { code: 'active_run_conflict' } }), true);
  for (const error of [
    new Error('timeout'),
    { status: 408 },
    { status: 500 },
    { status: 409, data: { code: 'chat_exists' } },
    { status: 409 }
  ])
    assert.equal(isDefinitiveChatDerivationRejection(error), false);
});
test('actual derive controller replaces only after source service confirms local history; failures and abandoned sources retain the current screen', async () => {
  const source = ts.createSourceFile(
    'controller.ts',
    readFileSync(
      new URL('../../src/features/chatPersistence/useChatDetailConversationController.ts', import.meta.url),
      'utf8'
    ),
    ts.ScriptTarget.Latest,
    true
  );
  let action: ts.VariableDeclaration | undefined;
  function find(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleDeriveRun') action = node;
    else ts.forEachChild(node, find);
  }
  find(source);
  const code = ts.transpileModule(`const ${action!.getText(source)}; handleDeriveRun`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const calls: any[] = [],
    errors: string[] = [],
    active = { current: 'source' };
  let failure = false,
    release!: (value: any) => void,
    deferred = false;
  const result = {
    conversation: { conversationId: 'child', title: 'server context' },
    historyScope: { teamId: 'team', agentKey: null }
  };
  const callback = vm.runInNewContext(code, {
    conversationId: 'source',
    activeConversationIdRef: active,
    conversationTargetRouteParams: { teamId: 'team', title: 'Team' },
    navigation: { replace: (...args: any[]) => calls.push(args) },
    useCallback: (fn: any) => fn,
    setErrorText: (value: string) => errors.push(value),
    chatSyncService: {
      deriveConversation: async (id: string, run: string) => {
        assert.equal(id, 'source');
        assert.equal(run, 'selected-run');
        if (failure) throw new Error('permission changed');
        if (deferred)
          return new Promise((done) => {
            release = done;
          });
        return result;
      }
    },
    Error
  });
  await callback('selected-run');
  assert.equal(calls[0][0], 'ChatDetail');
  assert.equal(calls[0][1].conversationId, 'child');
  assert.equal(calls[0][1].initialConversation.title, 'server context');
  assert.equal(calls[0][1].historyScope.teamId, 'team');
  assert.equal(calls[0][1].skipInitialReconcile, true);
  failure = true;
  await callback('selected-run');
  assert.equal(calls.length, 1);
  assert.equal(errors.at(-1), 'permission changed');
  failure = false;
  deferred = true;
  const pending = callback('selected-run');
  active.current = 'next-chat';
  release(result);
  await pending;
  assert.equal(calls.length, 1);
});
test('Native derive control blocks same-frame duplicate taps and offers only verification for a persisted unknown result', async () => {
  const { createRequire } = await import('node:module'),
    { transformSync } = await import('@babel/core');
  const React = await import('react'),
    { act, create } = await import('react-test-renderer');
  const { defaultT } = await import('../../src/shared/i18n/translate.ts');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const url = new URL('../../src/features/chatPersistence/components/ChatRunDerivation.tsx', import.meta.url);
  const code = transformSync(readFileSync(url, 'utf8'), {
    filename: url.pathname,
    configFile: false,
    babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'
    ]
  })!.code!;
  const require = createRequire(import.meta.url),
    module = { exports: {} as any };
  const deps: Record<string, unknown> = {
    'react-native': { ActivityIndicator: 'Spinner', Pressable: 'Button', Text: 'Text', View: 'View' },
    '../../../shared/i18n': { useT: () => defaultT }
  };
  new Function('require', 'module', 'exports', code)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  const Component = module.exports.ChatRunDerivation;
  const node = { runId: 'selected', lifecycle: 'complete', completedAt: now };
  let calls = 0,
    finish!: () => void,
    renderer: any,
    unmounted = false;
  const callback = async (run: string) => {
    calls++;
    assert.equal(run, 'selected');
    return new Promise<void>((done) => {
      finish = done;
    });
  };
  await act(async () => {
    renderer = create(React.createElement(Component, { node, disabled: false, onDerive: callback }));
  });
  try {
    const button = renderer.root.findByType('Button');
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
    });
    assert.equal(calls, 1);
    assert.equal(renderer.root.findByType('Button').props.disabled, true);
    await act(async () => finish());
    await act(async () =>
      renderer.update(React.createElement(Component, { node, disabled: true, onDerive: callback }))
    );
    assert.equal(renderer.root.findByType('Button').props.disabled, true);
    await act(async () =>
      renderer.update(
        React.createElement(Component, {
          node: { ...node, derivation: { phase: 'unknown', chatId: 'child', agentKey: 'agent' } },
          disabled: true,
          onDerive: callback
        })
      )
    );
    assert.equal(renderer.root.findByType('Button').props.disabled, false);
    assert.equal(renderer.root.findAllByType('Text')[0].props.children, defaultT('runDerivation.check'));
    await act(async () => renderer.root.findByType('Button').props.onPress());
    assert.equal(calls, 2);
    await act(async () => renderer.unmount());
    unmounted = true;
    await act(async () => finish());
  } finally {
    if (!unmounted) await act(async () => renderer.unmount());
  }
});
