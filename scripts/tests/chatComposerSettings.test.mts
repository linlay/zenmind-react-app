import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
import * as skillsProtocol from '../../src/core/api/services/chatSkillsProtocol.ts';
import * as modelProtocol from '../../src/core/api/services/modelOptionsProtocol.ts';
import * as interaction from '../../src/features/chatPersistence/agentInteraction.ts';
import * as preferences from '../../src/features/chatPersistence/chatComposerPreferences.ts';
import * as runAccess from '../../src/features/chatTimeline/timelineRunAccess.ts';
import { createChatTimelineState, deriveChatTimelineState } from '../../src/features/chatTimeline/timelineReducer.ts';
import {
  serializeChatTimelineState,
  deserializeChatTimelineState
} from '../../src/features/chatTimeline/timelinePersistence.ts';
import * as chatSource from '../../src/features/chatPersistence/chatSource.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
const require = createRequire(import.meta.url);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function load(file: string, deps: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports: Record<string, any> = {};
  new Function('require', 'exports', code)((id: string) => deps[id] ?? require(id), exports);
  return exports;
}
const config = { model: true, accessLevel: true, attachment: { localFiles: true } };
function detail(key = 'agent', interactionConfig: unknown = config) {
  return { agentKey: key, raw: { interactionConfig, modelKey: 'agent-default', reasoningEffort: 'LOW' } };
}
const catalog = { models: ['agent-default', 'chosen', 'sent-model', 'later-agent-default', 'manual-after-confirm', 'late', 'chat-only', 'current', 'other', 'persisted', 'future'].map(key => ({ key, name: key, serviceTiers: ['STANDARD', 'FAST'], raw: {} })), reasoningEfforts: ['NONE','LOW','MEDIUM','HIGH'].map(key => ({key, label:key})), serviceTiers: ['STANDARD','FAST'].map(key => ({key,label:key})), fetchedAt: 1 };
const deferred = () => {
  let resolve!: (value: any) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<any>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
let sequence = 0;
async function settingsFixture(extra: Record<string, any> = {}, initial: Record<string, any> = {}) {
  let scope = `settings-${++sequence}`;
  const owner = `cloud:${scope}`;
  const saves: any[] = [];
  const service = {
    getAgentDetailSnapshot: () => detail(),
    ensureAgentDetail: async (key: string) => detail(key),
    getAgentModelOptionsSnapshot: () => catalog,
    ensureAgentModelOptions: async () => catalog,
    updateAgentModelConfig: async (key: string, value: any) => {
      saves.push({ key, value });
      return value;
    },
    ...extra
  };
  const { useChatComposerSettings: useSettings } = load(
    '../../src/features/chatPersistence/useChatComposerSettings.ts',
    {
      '../../core/api/services/modelOptionsProtocol': modelProtocol,
      '../../core/auth/accountAuth': { getAccountAuthSnapshot: () => ({ session: { accountId: 'account' } }) },
      '../../shared/i18n': { useT: () => defaultT },
      '../chatRealtime/chatSyncService': { chatSyncService: service },
      '../chatTimeline/timelineRunAccess': runAccess,
      './agentInteraction': interaction,
      './cacheScope': { getChatCacheScopeId: () => scope },
      './chatSource': { ...chatSource, getChatSourceFromId: () => ({ kind: 'default' }) },
      './chatComposerPreferences': preferences,
      './chatRepository': { readComposerConfiguration: async () => undefined, saveComposerConfiguration: async () => {}, ...extra.repository },
      '../../core/api/services/chatSkillsProtocol': skillsProtocol
    }
  );
  let props = {
    conversationId: 'preallocated',
    agentKey: 'agent',
    timeline: createChatTimelineState('preallocated'),
    historyReady: true,
    isFocused: true,
    reloadSeed: 0,
    ...initial
  };
  let result: any;
  function Harness() {
    result = useSettings(props);
    return null;
  }
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(Harness));
  });
  return {
    get value() {
      return result;
    },
    saves,
    service,
    owner,
    get scope() {
      return scope;
    },
    changeScope(value: string) {
      scope = value;
    },
    async update(patch: Record<string, any>) {
      props = { ...props, ...patch };
      await act(async () => {
        renderer.update(React.createElement(Harness));
      });
    },
    async close() {
      await act(async () => {
        renderer.unmount();
        preferences.clearChatComposerPreferences(owner);
      });
    }
  };
}
function confirmed(chat = 'preallocated', model: any = { key: 'requested', reasoningEffort: 'HIGH' }) {
  const state = deriveChatTimelineState(chat, [
    {
      type: 'request.query',
      chatId: chat,
      runId: 'main',
      message: 'sent request',
      query: { accessLevel: 'auto_approve', model },
      timestamp: 100
    },
    { type: 'run.start', runId: 'main', timestamp: 110 },
    { type: 'run.complete', runId: 'main', timestamp: 120 }
  ]);
  const user = Object.values(state.nodesById).find((node) => node.kind === 'message' && node.role === 'user');
  if (user?.kind === 'message') state.nodesById[user.id] = { ...user, clientMessageId: 'first' };
  return state;
}

test('configuration loading/error/explicit closure retain preference and only change effective submission', async () => {
  let response: any = detail();
  const f = await settingsFixture({ ensureAgentDetail: async () => response });
  try {
    await act(async () => {
      f.value.setAccessLevel('full_access');
      await f.value.setModelOverride({ key: 'chosen' });
    });
    response = detail('agent', undefined); // Missing required booleans is a configuration error.
    response.raw.interactionConfig = undefined;
    await act(async () => {
      f.value.retryConfiguration();
    });
    assert.equal(f.value.agentAvailability, 'error');
    assert.match(f.value.configurationError, /配置/);
    assert.equal(f.value.modelOverride.key, 'chosen');
    assert.equal(f.value.inputReady, false);
    response = detail('agent', { model: false, accessLevel: false, attachment: { localFiles: false } });
    await act(async () => {
      f.value.retryConfiguration();
    });
    assert.equal(f.value.agentAvailability, 'available');
    assert.equal(f.value.modelOverride.key, 'chosen');
    assert.equal(f.value.accessLevel, 'full_access');
    assert.deepEqual(f.value.submitModel, {});
    assert.equal(f.value.submitAccessLevel, 'default');
    response = detail();
    await act(async () => {
      f.value.retryConfiguration();
    });
    assert.equal(f.value.submitModel.key, 'chosen');
    assert.equal(f.value.submitAccessLevel, 'full_access');
  } finally {
    await f.close();
  }
});

test('preallocated IDs wait for history; existing Chat selection never updates Agent defaults', async () => {
  const f = await settingsFixture({}, { historyReady: false });
  try {
    await act(async () => {
      await f.value.setModelOverride({ key: 'too-early' });
    });
    assert.equal(f.saves.length, 0);
    await f.update({ timeline: confirmed(), historyReady: true });
    assert.equal(f.value.modelOverride.key, 'requested');
    await act(async () => {
      await f.value.setModelOverride({ key: 'chat-only' });
    });
    assert.equal(f.saves.length, 0);
    await f.update({ conversationId: 'other', timeline: confirmed('other') });
    assert.equal(f.value.modelOverride.key, 'requested');
    await f.update({ conversationId: 'preallocated', timeline: confirmed() });
    assert.equal(f.value.modelOverride.key, 'chat-only');
  } finally {
    await f.close();
  }
});

test('new Chat saves Agent defaults and first confirmation captures send-time settings exactly once', async () => {
  const f = await settingsFixture();
  try {
    await act(async () => {
      await f.value.setModelOverride({ key: 'sent-model' });
      f.value.setAccessLevel('full_access');
    });
    await act(async () => {
      f.value.captureSubmission()('first');
    });
    await act(async () => {
      await f.value.setModelOverride({ key: 'later-agent-default' });
    });
    assert.equal(f.saves.length, 2);
    // Failure/unknown has not confirmed a main query, so it cannot initialize a Chat preference.
    assert.equal(
      preferences.readChatComposerPreference({ owner: f.owner, scope: f.scope, kind: 'chat', id: 'preallocated' })?.model,
      undefined
    );
    await f.update({ timeline: confirmed() });
    assert.equal(f.value.modelOverride.key, 'later-agent-default');
    assert.equal(f.value.accessLevel, 'full_access');
    await act(async () => {
      await f.value.setModelOverride({ key: 'manual-after-confirm' });
    });
    await f.update({ timeline: confirmed() });
    assert.equal(f.value.modelOverride.key, 'manual-after-confirm');
    assert.equal(f.saves.length, 2);
  } finally {
    await f.close();
  }
});

test('late model save cannot cross Chat/Agent/source identity or overwrite a returned target', async () => {
  const save = deferred();
  const f = await settingsFixture({ updateAgentModelConfig: () => save.promise });
  try {
    let pending: Promise<void>;
    await act(async () => {
      pending = f.value.setModelOverride({ key: 'late' });
    });
    await f.update({ agentKey: 'other-agent' });
    await f.update({ agentKey: 'agent' });
    await act(async () => {
      save.resolve({ key: 'late' });
      await pending!;
    });
    assert.equal(f.value.modelOverride.key, 'agent-default');
    await act(async () => {
      f.value.setAccessLevel('full_access');
    });
    const oldScope = f.scope;
    f.changeScope(`${oldScope}-other`);
    await f.update({});
    assert.equal(f.value.accessLevel, 'default');
    f.changeScope(oldScope);
    await f.update({});
    assert.equal(f.value.accessLevel, 'full_access');
    await act(async () => {
      preferences.clearChatComposerPreferences(f.owner);
    });
    assert.equal(f.value.accessLevel, 'default');
  } finally {
    await f.close();
  }
});

test('root request metadata and same-run usage restore identically from replay, snapshots and stale merge', () => {
  const events = [
    {
      type: 'request.query',
      chatId: 'chat',
      runId: 'main',
      query: { message: '', accessLevel: 'full_access', model: { key: 'requested' } },
      timestamp: 100
    },
    { type: 'run.start', runId: 'main', timestamp: 110 },
    {
      type: 'usage.snapshot',
      runId: 'main',
      model: { key: 'actual', serviceTier: 'FAST' },
      contextWindow: { reasoningEffort: 'HIGH' },
      timestamp: 120
    },
    {
      type: 'usage.snapshot',
      runId: 'main',
      taskId: 'child',
      model: { key: 'child', serviceTier: 'FLEX' },
      timestamp: 130
    },
    { type: 'request.query', runId: 'child', taskId: 'child', query: { model: { key: 'wrong' } }, timestamp: 140 },
    { type: 'run.start', runId: 'child', taskId: 'child', timestamp: 141 },
    { type: 'run.complete', runId: 'main', timestamp: 150 }
  ];
  events.splice(
    4,
    0,
    ...([{ subAgentKey: 'sub' }, { btwId: 'side' }, { lane: 'explain' }].map((extra) => ({
      type: 'usage.snapshot',
      runId: 'main',
      model: { key: 'excluded' },
      timestamp: 135,
      ...extra
    })) as any)
  );
  const state = deriveChatTimelineState('chat', events);
  const expected = {
    established: true,
    accessLevel: 'full_access',
    model: { key: 'requested', reasoningEffort: 'HIGH', serviceTier: 'FAST' }
  };
  assert.deepEqual(runAccess.resolveChatComposerHistory(state), expected);
  const saved = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(saved.meta, saved.nodes)!;
  assert.deepEqual(runAccess.resolveChatComposerHistory(restored), expected);
  const main = runAccess.getChatTimelineRun(state, 'main')!;
  const stale = { ...main, queryModel: undefined, isMainRun: undefined };
  assert.equal(runAccess.mergeRunAccessMetadata(stale, main, stale).queryModel?.key, 'requested');
  assert.equal(
    Object.values(state.nodesById).some((node) => node.kind === 'message' && !node.content),
    false
  );
  for (const extra of [
    { taskId: 'child' },
    { subAgentKey: 'child' },
    { btwId: 'branch' },
    { lane: 'explain' },
    { chatId: 'other' }
  ]) {
    assert.equal(runAccess.isMainChatRunEvent(extra, 'chat'), false);
  }
});

test('first-Chat initialization requires the exact confirmed request and ignores rejected or foreign submissions', async () => {
  const f = await settingsFixture();
  const chatTarget = { owner: f.owner, scope: f.scope, kind: 'chat' as const, id: 'preallocated' };
  try {
    let finish!: (requestId?: string) => void;
    await act(async () => {
      finish = f.value.captureSubmission();
      finish();
    });
    await f.update({ timeline: confirmed() });
    assert.equal(preferences.readChatComposerPreference(chatTarget)?.model, undefined);
    await f.update({ timeline: createChatTimelineState('preallocated') });
    await act(async () => {
      f.value.setAccessLevel('full_access');
    });
    await act(async () => {
      finish = f.value.captureSubmission();
      finish('expected');
    });
    await f.update({ timeline: confirmed() }); // This query belongs to another request.
    assert.equal(preferences.readChatComposerPreference(chatTarget)?.model, undefined);
    const own = confirmed();
    const user = Object.values(own.nodesById).find((node) => node.kind === 'message' && node.role === 'user')!;
    if (user.kind === 'message') own.nodesById[user.id] = { ...user, clientMessageId: 'expected' };
    await f.update({ timeline: own });
    assert.equal(preferences.readChatComposerPreference(chatTarget)?.accessLevel, 'full_access');
  } finally {
    await f.close();
  }
});

test('unchanged effective model keeps submission identity across unrelated renders', async () => {
  const fixture = await settingsFixture();
  try {
    const model = fixture.value.submitModel;
    await fixture.update({});
    assert.equal(fixture.value.submitModel, model);
    await fixture.update({ timeline: confirmed() });
    assert.notEqual(fixture.value.submitModel, model);
    assert.equal(fixture.value.submitModel.key, 'requested');
  } finally {
    await fixture.close();
  }
});

test('applied model and Chat skills reload from configuration while drafts and Agent defaults are never stored', async () => {
  const rows = new Map<string, any>();
  const writes: any[] = [];
  const repository = {
    readComposerConfiguration: async (target: any) => rows.get(target.id),
    saveComposerConfiguration: async (target: any, patch: any) => {
      writes.push({ target, patch });
      rows.set(target.id, { ...rows.get(target.id), ...patch });
    }
  };
  const f = await settingsFixture({ repository }, { timeline: confirmed() });
  try {
    await act(async () => { assert.equal(await f.value.setModelOverride({ key: 'persisted', serviceTier: 'STANDARD' }), true); });
    await act(async () => { await f.value.setSelectedSkills(['PDF']); });
    // Capability is explicit, so enable skills before persisting them.
    assert.equal(writes.length, 1);
    f.service.ensureAgentDetail = async () => detail('agent', { ...config, attachment: { localFiles: true, skills: true } });
    await act(async () => f.value.retryConfiguration());
    await act(async () => { await f.value.setSelectedSkills(['PDF']); });
    assert.deepEqual(rows.get('preallocated'), { model: { key: 'persisted', serviceTier: 'STANDARD' }, skillIds: ['PDF'] });
    await act(async () => { preferences.clearChatComposerPreferences(f.owner); f.value.retryConfiguration(); });
    assert.equal(f.value.modelOverride.key, 'persisted');
    assert.deepEqual(f.value.selectedSkills, ['PDF']);
    await f.update({ conversationId: 'fresh', timeline: createChatTimelineState('fresh') });
    assert.deepEqual(f.value.selectedSkills, []);
    assert.equal(f.value.modelOverride.key, 'agent-default');
    assert.ok(writes.every(({ target, patch }) => target.kind === 'chat' && Object.keys(patch).every(k => ['model','skillIds'].includes(k))));
  } finally { await f.close(); }
});

test('model save failure preserves applied configuration and can retry; invalid catalog values are not substituted', async () => {
  let fail = true;
  const f = await settingsFixture({ repository: { saveComposerConfiguration: async () => { if (fail) throw new Error('disk full'); } } }, { timeline: confirmed() });
  try {
    const before = f.value.modelOverride;
    await act(async () => { assert.equal(await f.value.setModelOverride({ key: 'persisted' }), false); });
    assert.deepEqual(f.value.modelOverride, before);
    assert.match(f.value.modelOptionsError, /disk full/);
    fail = false;
    await act(async () => { assert.equal(await f.value.setModelOverride({ key: 'persisted', serviceTier: 'STANDARD' }), true); });
    await act(async () => { assert.equal(await f.value.setModelOverride({ key: 'missing' }), false); });
    assert.equal(f.value.modelOverride.key, 'persisted');
    await act(async () => { assert.equal(await f.value.setModelOverride({ key: 'persisted', serviceTier: 'UNAVAILABLE' }), false); });
    assert.equal(f.value.modelOverride.serviceTier, 'STANDARD');
  } finally { await f.close(); }
});

test('failed first-confirmation persistence retries without losing the confirmed model or newer manual selection', async () => {
  let fail = true, stored: any;
  const f = await settingsFixture({ repository: {
    readComposerConfiguration: async () => stored,
    saveComposerConfiguration: async (_target: any, patch: any) => { if (fail) throw new Error('disk unavailable'); stored = { ...stored, ...patch }; }
  }});
  try {
    await act(async () => { await f.value.setModelOverride({ key: 'chosen' }); });
    await act(async () => { f.value.captureSubmission()('first'); });
    await f.update({ timeline: confirmed() });
    assert.equal(f.value.modelOverride.key, 'chosen');
    assert.match(f.value.configurationError, /disk unavailable/);
    fail = false;
    await act(async () => f.value.retryConfiguration());
    assert.equal(stored.model.key, 'chosen');
    assert.equal(f.value.configurationError, '');
  } finally { await f.close(); }
});

test('late configuration read cannot overwrite another Chat or source and runtime model selection leaves Run metadata intact', async () => {
  const pending = deferred();
  const f = await settingsFixture({ repository: { readComposerConfiguration: (target: any) => target.id === 'preallocated' ? pending.promise : Promise.resolve({ skillIds: ['other'] }) } });
  try {
    await f.update({ conversationId: 'other-chat', timeline: confirmed('other-chat') });
    await act(async () => pending.resolve({ model: { key: 'late' }, skillIds: ['wrong'] }));
    assert.deepEqual(f.value.selectedSkills, ['other']);
    assert.notEqual(f.value.modelOverride.key, 'late');
    const run = confirmed('other-chat');
    const node = Object.values(run.nodesById).find(node => node.kind === 'run')!;
    if (node.kind === 'run') { node.lifecycle = 'active'; run.activeRunId = node.runId; }
    await f.update({ timeline: run });
    await act(async () => { assert.equal(await f.value.setModelOverride({ key: 'future' }), true); });
    assert.equal(f.value.submitModel.key, 'future');
    assert.equal(node.kind === 'run' && node.runId, 'main');
    assert.equal(f.saves.length, 0);
  } finally { await f.close(); }
});

test('runtime permission is copied to subsequent Chat input only after confirmed change', async () => {
  const state = confirmed();
  const node = Object.values(state.nodesById).find(node => node.kind === 'run')!;
  assert.equal(node.kind, 'run');
  if (node.kind !== 'run') return;
  state.nodesById[node.id] = { ...node, lifecycle:'active', accessLevel:'full_access', accessLevelVersion:1 };
  state.activeRunId = node.runId;
  const f = await settingsFixture({}, { timeline:state });
  try {
    await act(async () => f.value.setAccessLevel('auto_approve'));
    assert.equal(f.value.accessLevel, 'auto_approve');
    const pending = { ...state, nodesById:{ ...state.nodesById, [node.id]:{ ...state.nodesById[node.id], accessUpdate:{phase:'sending',requestId:'change',baselineVersion:1} } } };
    await f.update({ timeline:pending });
    assert.equal(f.value.accessLevel, 'auto_approve');
    await f.update({ timeline:state }); // explicit rejection clears pending, but does not change future selection
    assert.equal(f.value.accessLevel, 'auto_approve');
    await f.update({ timeline:pending });
    const changed = { ...pending, nodesById:{ ...pending.nodesById, [node.id]:{ ...pending.nodesById[node.id], accessUpdate:undefined, accessLevelVersion:2 } } };
    await f.update({ timeline:changed });
    assert.equal(f.value.accessLevel, 'full_access');
    await f.update({ timeline:confirmed() });
    assert.equal(f.value.submitAccessLevel, 'full_access');
  } finally { await f.close(); }
});

test('disabled skill capability permits removal of remembered skills but never adding new IDs', async () => {
  const f = await settingsFixture({
    ensureAgentDetail: async () => detail('agent', { ...config, attachment: { ...config.attachment, skills: false } }),
    repository: { readComposerConfiguration: async () => ({ skillIds: ['old', 'retired'] }) }
  });
  try {
    await act(async () => f.value.setSelectedSkills(['old']));
    assert.deepEqual(f.value.selectedSkills, ['old']);
    await act(async () => f.value.setSelectedSkills(['old', 'new']));
    assert.deepEqual(f.value.selectedSkills, ['old']);
    await act(async () => f.value.setSelectedSkills([]));
    assert.deepEqual(f.value.selectedSkills, []);
  } finally { await f.close(); }
});
