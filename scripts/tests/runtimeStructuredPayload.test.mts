import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRuntimeStructuredPayload,
  buildRuntimeStructuredPayloadValue,
  RUNTIME_STRUCTURED_MAX_LEAF_RENDER_CHARS,
  RUNTIME_STRUCTURED_MAX_NODES,
  RUNTIME_STRUCTURED_MAX_TOTAL_LEAF_CHARS,
  RUNTIME_TEXT_MAX_RENDER_CHARS,
  sanitizeRuntimeStructuredPayloadForCopy,
  type RuntimeStructuredPayloadNode
} from '../../src/features/chatPersistence/components/runtimeStructuredPayload.ts';

function flattenNodes(root: RuntimeStructuredPayloadNode): RuntimeStructuredPayloadNode[] {
  const nodes = [root];
  if (root.kind === 'branch') {
    for (const child of root.children) {
      nodes.push(...flattenNodes(child));
    }
  }
  return nodes;
}

test('runtime structured payload recursively projects objects and arrays while redacting secrets', () => {
  const view = buildRuntimeStructuredPayload(
    JSON.stringify({
      user: {
        name: 'Ada',
        password: 'secret-password',
        sessions: [{ csrfToken: 'secret-token', active: true }]
      }
    }),
    { role: 'args' }
  );

  assert.equal(view.kind, 'tree');
  if (view.kind !== 'tree') return;
  const nodes = flattenNodes(view.root);
  assert.ok(nodes.some((node) => node.kind === 'branch' && node.label === 'user'));
  assert.ok(nodes.some((node) => node.kind === 'branch' && node.label === 'sessions'));
  assert.ok(nodes.some((node) => node.kind === 'leaf' && node.label === 'password' && node.tone === 'redacted'));
  assert.ok(nodes.some((node) => node.kind === 'leaf' && node.label === 'csrfToken' && node.tone === 'redacted'));
  assert.equal(JSON.stringify(view).includes('secret-password'), false);
  assert.equal(JSON.stringify(view).includes('secret-token'), false);
});

test('runtime structured payload detects cycles and maximum depth without recursing forever', () => {
  const cyclic: Record<string, unknown> = { name: 'root' };
  cyclic.self = cyclic;
  let deep: Record<string, unknown> = { value: 'end' };
  for (let index = 0; index < 20; index += 1) {
    deep = { child: deep };
  }

  const cyclicView = buildRuntimeStructuredPayloadValue(cyclic);
  const deepView = buildRuntimeStructuredPayloadValue(deep);
  assert.equal(cyclicView.kind, 'tree');
  assert.equal(deepView.kind, 'tree');
  if (cyclicView.kind !== 'tree' || deepView.kind !== 'tree') return;
  assert.ok(flattenNodes(cyclicView.root).some((node) => node.kind === 'leaf' && node.notice === 'circular'));
  assert.ok(flattenNodes(deepView.root).some((node) => node.kind === 'leaf' && node.notice === 'max_depth'));
});

test('runtime structured payload enforces child and total node budgets', () => {
  const wideAndDeep = Object.fromEntries(
    Array.from({ length: 48 }, (_, outerIndex) => [
      `group-${outerIndex}`,
      Object.fromEntries(Array.from({ length: 48 }, (_, innerIndex) => [`item-${innerIndex}`, innerIndex]))
    ])
  );
  const view = buildRuntimeStructuredPayloadValue(wideAndDeep);

  assert.equal(view.kind, 'tree');
  if (view.kind !== 'tree') return;
  const nodes = flattenNodes(view.root);
  assert.ok(nodes.length <= RUNTIME_STRUCTURED_MAX_NODES);
  assert.ok(
    nodes.some((node) => node.kind === 'leaf' && (node.notice === 'max_nodes' || node.notice === 'more_children'))
  );
});

test('runtime structured payload bounds individual and aggregate long string leaves', () => {
  const view = buildRuntimeStructuredPayloadValue({
    first: 'a'.repeat(50_000),
    second: 'b'.repeat(50_000),
    third: 'c'.repeat(50_000)
  });

  assert.equal(view.kind, 'tree');
  if (view.kind !== 'tree') return;
  const stringLeaves = flattenNodes(view.root).filter(
    (node): node is Extract<RuntimeStructuredPayloadNode, { kind: 'leaf' }> =>
      node.kind === 'leaf' && node.tone === 'string'
  );
  assert.ok(stringLeaves.every((node) => node.valueText.length <= RUNTIME_STRUCTURED_MAX_LEAF_RENDER_CHARS));
  assert.ok(
    stringLeaves.reduce((total, node) => total + node.valueText.length, 0) <= RUNTIME_STRUCTURED_MAX_TOTAL_LEAF_CHARS
  );
  assert.ok(stringLeaves.every((node) => node.truncated));
});

test('runtime structured payload pages huge JSON-like and plain text without retaining a render-sized copy', () => {
  const hugeJsonLike = `[{"value":"${'x'.repeat(80_000)}"}]`;
  const hugeText = 'line\n'.repeat(20_000);
  const jsonView = buildRuntimeStructuredPayload(hugeJsonLike, { role: 'result' });
  const textView = buildRuntimeStructuredPayload(hugeText, { role: 'result' });

  assert.equal(jsonView.kind, 'text');
  assert.equal(textView.kind, 'text');
  if (jsonView.kind !== 'text' || textView.kind !== 'text') return;
  assert.equal(jsonView.structuredTooLarge, true);
  assert.equal(jsonView.text.length, RUNTIME_TEXT_MAX_RENDER_CHARS);
  assert.equal(jsonView.truncated, true);
  assert.equal(textView.text.length, RUNTIME_TEXT_MAX_RENDER_CHARS);
  assert.equal(textView.truncated, true);
});

test('runtime structured payload classifies code, patch, and failed result styles', () => {
  const code = buildRuntimeStructuredPayload('const answer = 42;', { role: 'result' });
  const patch = buildRuntimeStructuredPayload('diff --git a/a.ts b/a.ts\n@@ -1 +1 @@', { role: 'result' });
  const error = buildRuntimeStructuredPayload('{"message":"boom"}', {
    role: 'result',
    status: 'failed'
  });

  assert.equal(code.tone, 'code');
  assert.equal(patch.tone, 'patch');
  assert.equal(error.tone, 'error');
});

test('runtime structured payload redacts structured and inline secrets when copying', () => {
  const copied = sanitizeRuntimeStructuredPayloadForCopy(
    JSON.stringify({
      password: 'secret-password',
      nested: { apiKey: 'secret-api-key' },
      url: 'https://example.test/?access_token=secret-query',
      header: 'Bearer secret-bearer'
    })
  );

  assert.equal(copied.includes('secret-password'), false);
  assert.equal(copied.includes('secret-api-key'), false);
  assert.equal(copied.includes('secret-query'), false);
  assert.equal(copied.includes('secret-bearer'), false);
  assert.match(copied, /\[redacted\]/);

  const oversizedCopied = sanitizeRuntimeStructuredPayloadForCopy(
    `{"authToken":"oversized-secret","content":"${'x'.repeat(140_000)}"}`
  );
  assert.equal(oversizedCopied.includes('oversized-secret'), false);
});
