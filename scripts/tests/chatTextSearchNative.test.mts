import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create } from 'react-test-renderer';
import * as searchModule from '../../src/features/chatPersistence/chatTimelineTextSearch.ts';
import { deriveChatTimelineState } from '../../src/features/chatTimeline/timelineReducer.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
const now = 1_791_450_000_000;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function timeline(text = 'report first') {
  return deriveChatTimelineState('chat', [
    { type: 'content.snapshot', runId: 'run', contentId: 'answer', text, timestamp: now }
  ]);
}
test('production search UI is lazy, debounces queries, throttles live updates, preserves selection through paging and never re-reveals on live content', async () => {
  const url = new URL('../../src/features/chatPersistence/components/ChatTimelineTextSearch.tsx', import.meta.url);
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
  const timers = new Map<number, () => void>(),
    delays: number[] = [];
  let nextId = 0,
    cacheCount = 0,
    searches = 0;
  const deps: Record<string, unknown> = {
    'react-native': { Pressable: 'Button', Text: 'Text', TextInput: 'Input', View: 'View' },
    '../../../shared/i18n': { useT: () => defaultT },
    '../chatTimelineTextSearch.ts': {
      ...searchModule,
      createChatTimelineTextSearch: () => {
        cacheCount++;
        const real = searchModule.createChatTimelineTextSearch();
        return {
          clear: real.clear,
          search: (...args: Parameters<typeof real.search>) => {
            searches++;
            return real.search(...args);
          }
        };
      }
    }
  };
  const require = createRequire(import.meta.url),
    module = { exports: {} as any };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports,
    (fn: () => void, delay: number) => {
      const id = ++nextId;
      timers.set(id, fn);
      delays.push(delay);
      return id;
    },
    (id: number) => timers.delete(id)
  );
  const Component = module.exports.ChatTimelineTextSearch;
  const reveals: string[] = [],
    active: boolean[] = [],
    selected: string[] = [];
  const props = {
    timeline: timeline(),
    onReveal: (id: string) => reveals.push(id),
    onActiveChange: (value: boolean) => active.push(value),
    onSelectNode: (id: string) => selected.push(id)
  };
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(Component, props));
  });
  const button = (key: any) =>
    renderer.root
      .findAllByType('Button')
      .find((b: any) => b.findAllByType('Text').some((t: any) => t.props.children === defaultT(key)));
  const plain = (value: any): string =>
    Array.isArray(value) ? value.map(plain).join('') : value?.props ? plain(value.props.children) : String(value ?? '');
  const flush = async () => {
    const callbacks = [...timers.values()];
    timers.clear();
    await act(async () => callbacks.forEach((fn) => fn()));
  };
  try {
    assert.equal(cacheCount, 0);
    assert.equal(searches, 0);
    await act(async () => button('textSearch.open').props.onPress());
    assert.equal(cacheCount, 1);
    assert.equal(active.at(-1), true);
    assert.equal(renderer.root.findByType('Input').props.maxLength, 128);
    await act(async () => renderer.root.findByType('Input').props.onChangeText('wrong'));
    await act(async () => renderer.root.findByType('Input').props.onChangeText('report'));
    assert.equal(timers.size, 1);
    assert.equal(searches, 0);
    for (let i = 0; i < 10; i++)
      await act(async () =>
        renderer.update(React.createElement(Component, { ...props, timeline: timeline(`report first ${i}`) }))
      );
    assert.equal(timers.size, 1);
    assert.equal(searches, 0);
    await flush();
    assert.equal(searches, 1);
    assert.equal(reveals.length, 1);
    const selectedId = selected.at(-1);
    assert.ok(
      renderer.root
        .findAllByType('Text')
        .some((t: any) => String(t.props.children).includes(defaultT('textSearch.scope')))
    );
    await act(async () =>
      renderer.update(React.createElement(Component, { ...props, timeline: timeline('report first report second') }))
    );
    await flush();
    assert.equal(searches, 2);
    assert.equal(reveals.length, 1);
    assert.equal(selected.at(-1), selectedId);
    await act(async () => button('textSearch.next').props.onPress());
    assert.equal(reveals.length, 2);
    const newer = timeline('report first report second'),
      older = deriveChatTimelineState('chat', [
        { type: 'request.query', requestId: 'older', runId: 'older', message: 'report older', timestamp: now - 100 }
      ]);
    const page = {
      ...newer,
      orderedNodeIds: [...older.orderedNodeIds, ...newer.orderedNodeIds],
      nodesById: { ...older.nodesById, ...newer.nodesById }
    };
    await act(async () => renderer.update(React.createElement(Component, { ...props, timeline: page })));
    await flush();
    assert.equal(reveals.length, 2);
    assert.equal(selected.at(-1), selectedId);
    assert.ok(renderer.root.findAllByType('Text').some((t: any) => plain(t.props.children).includes('3/3')));
    await act(async () =>
      renderer.update(React.createElement(Component, { ...props, timeline: timeline('report plus') }))
    );
    assert.equal(timers.size, 1);
    await act(async () => button('textSearch.close').props.onPress());
    assert.equal(timers.size, 0);
    assert.equal(active.at(-1), false);
    assert.equal(selected.at(-1), '');
    const before = searches;
    await act(async () =>
      renderer.update(React.createElement(Component, { ...props, timeline: timeline('report newest') }))
    );
    assert.equal(searches, before);
    assert.equal(cacheCount, 1);
    assert.equal(timers.size, 0);
    assert.equal(
      delays.every((delay) => delay === 180),
      true
    );
  } finally {
    await act(async () => renderer.unmount());
  }
});
