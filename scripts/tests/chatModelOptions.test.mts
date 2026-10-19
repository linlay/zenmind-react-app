import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildAgentModelConfigPayload,
  buildModelOptionsPayload,
  MODEL_CONFIG_API_PATH,
  MODEL_OPTIONS_API_PATH,
  normalizeModelOptionsAgentKey,
  unwrapModelOptionsApiEnvelope,
  normalizeModelOptionsResponse
} from '../../src/core/api/services/modelOptionsProtocol.ts';

const modelOptionsApiSource = readFileSync(
  new URL('../../src/core/api/services/modelOptionsApi.ts', import.meta.url),
  'utf8'
);
const chatSyncServiceSource = readFileSync(
  new URL('../../src/features/chatRealtime/chatSyncService.ts', import.meta.url),
  'utf8'
);

test('model options payload strips agent prefix and omits empty agent key', () => {
  assert.equal(MODEL_OPTIONS_API_PATH, '/api/model-options');
  assert.equal(MODEL_CONFIG_API_PATH, '/api/agent/model-config');
  assert.equal(normalizeModelOptionsAgentKey(' agent:coder-demo '), 'coder-demo');
  assert.equal(normalizeModelOptionsAgentKey(' coder-demo '), 'coder-demo');
  assert.deepEqual(buildModelOptionsPayload(' agent:coder-demo '), { agentKey: 'coder-demo' });
  assert.deepEqual(buildModelOptionsPayload(' coder-demo '), { agentKey: 'coder-demo' });
  assert.deepEqual(buildModelOptionsPayload('  '), {});
});

test('agent model config payload strips agent prefix and explicitly clears standard service tier', () => {
  assert.deepEqual(
    buildAgentModelConfigPayload(' agent:coder-demo ', {
      key: ' qwen-max ',
      reasoningEffort: 'HIGH',
      serviceTier: 'STANDARD'
    }),
    {
      agentKey: 'coder-demo',
      modelKey: 'qwen-max',
      reasoningEffort: 'HIGH',
      serviceTier: null
    }
  );
  assert.deepEqual(
    buildAgentModelConfigPayload('coder-demo', {
      key: 'qwen-max',
      reasoningEffort: 'LOW',
      serviceTier: 'FAST'
    }),
    {
      agentKey: 'coder-demo',
      modelKey: 'qwen-max',
      reasoningEffort: 'LOW',
      serviceTier: 'FAST'
    }
  );
});

test('model options api envelope unwrap rejects non-zero business code', () => {
  assert.deepEqual(unwrapModelOptionsApiEnvelope({ code: 0, data: { key: 'coder-demo' } }), { key: 'coder-demo' });
  assert.throws(() => unwrapModelOptionsApiEnvelope({ code: 500, msg: 'save failed' }), /save failed/);
});

test('model options response unwraps envelopes and filters invalid options', () => {
  const snapshot = normalizeModelOptionsResponse({
    code: 0,
    data: {
      models: [
        { key: 'qwen-max', name: 'Qwen Max', provider: 'dashscope', serviceTiers: ['standard', 'priority', 'flex'] },
        { key: '', name: 'Missing key' },
        { key: 'nameless' }
      ],
      reasoningEfforts: [
        { key: 'medium', label: 'Medium' },
        { key: 'extra_high', label: 'Extra High' },
        { key: 'unknown' }
      ],
      serviceTiers: [
        { key: 'priority', label: 'Fast' },
        { key: 'flex', label: 'Flex' },
        { key: 'STANDARD', label: 'Duplicate standard' }
      ],
      defaultModelKey: { key: 'qwen-max' },
      defaultReasoningEffort: 'extra_high',
      defaultServiceTier: 'priority'
    }
  });

  assert.equal('defaultModelKey' in snapshot, false);
  assert.deepEqual(
    snapshot.models.map((model) => model.key),
    ['qwen-max']
  );
  assert.deepEqual(snapshot.models[0]?.serviceTiers, ['STANDARD', 'FAST', 'FLEX']);
  assert.deepEqual(
    snapshot.reasoningEfforts.map((option) => option.key),
    ['MEDIUM', 'XHIGH']
  );
  assert.deepEqual(
    snapshot.serviceTiers.map((option) => option.key),
    ['STANDARD', 'FAST', 'FLEX']
  );
});

test('model options reject invalid configuration but accept an empty catalog for retry', () => {
  assert.throws(() => normalizeModelOptionsResponse({ data: { unexpected: true } }), /Invalid model options response/);
  const snapshot = normalizeModelOptionsResponse({ models: [], reasoningEfforts: [] });
  assert.deepEqual(snapshot.models, []);
  assert.deepEqual(snapshot.reasoningEfforts, []);
  assert.deepEqual(snapshot.serviceTiers, [{ key: 'STANDARD', label: 'Standard' }]);
});

test('chat sync service keeps model options in an agent-scoped app lifetime cache', () => {
  assert.match(chatSyncServiceSource, /const normalizedAgentKey = normalizeModelOptionsAgentKey\(agentKey\)/);
  assert.match(chatSyncServiceSource, /agentModelOptions = new Map<string, ModelOptionsSnapshot>/);
  assert.match(
    chatSyncServiceSource,
    /agentModelOptionRequests = new Map<string, Promise<ModelOptionsSnapshot \| null>>/
  );
  assert.match(chatSyncServiceSource, /getAgentModelOptionsSnapshot\(agentKey: string\)/);
  assert.match(chatSyncServiceSource, /ensureAgentModelOptions\(\s*agentKey: string,\s*options:/);
  assert.match(chatSyncServiceSource, /if \(!options\.refresh && this\.agentModelOptions\.has\(normalizedAgentKey\)\)/);
  assert.match(chatSyncServiceSource, /this\.fetchAgentModelOptions\(normalizedAgentKey, cacheVersion\)/);
  assert.doesNotMatch(chatSyncServiceSource, /this\.agentModelOptions\.set\(agentKey, null\)/);
  assert.match(chatSyncServiceSource, /this\.agentModelOptions\.clear\(\)/);
});

test('model options api uses the active AP WebSocket transport without dynamic imports', () => {
  assert.match(modelOptionsApiSource, /import \{ ApiError \} from '\.\.\/apiError\.ts';/);
  assert.match(modelOptionsApiSource, /import \{ resolveActiveWsTransportConfig \} from '\.\.\/activeWsTransport';/);
  assert.match(modelOptionsApiSource, /import \{ sharedWsTransport \} from '\.\.\/\.\.\/ws\/sharedWsTransport\.ts';/);
  assert.match(modelOptionsApiSource, /resolveActiveWsTransportConfig\('ap'\)/);
  assert.match(modelOptionsApiSource, /sharedWsTransport\.request<unknown>\(\{/);
  assert.match(modelOptionsApiSource, /type,/);
  assert.match(modelOptionsApiSource, /payload,/);
  assert.match(
    modelOptionsApiSource,
    /requestApTransport\(MODEL_OPTIONS_API_PATH, buildModelOptionsPayload\(agentKey\), signal, transport\)/
  );
  assert.match(
    modelOptionsApiSource,
    /requestApTransport\(\s*MODEL_CONFIG_API_PATH,\s*buildAgentModelConfigPayload\(agentKey, modelOverride\),\s*signal,\s*transport\s*\)/s
  );
  assert.match(modelOptionsApiSource, /return unwrapModelOptionsApiEnvelope\(payload\)/);
  assert.match(modelOptionsApiSource, /namespace: config\.kind === 'desktop-ws' \? config\.namespace : undefined/);
  assert.doesNotMatch(modelOptionsApiSource, /authenticatedApiRequest/);
  assert.match(modelOptionsApiSource, /export \* from '\.\/modelOptionsProtocol\.ts';/);
  assert.doesNotMatch(modelOptionsApiSource, /await import\('\.\.\/apiClient\.ts'\)/);
});
