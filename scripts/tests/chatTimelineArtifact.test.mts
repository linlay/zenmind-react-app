import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeAuthenticatedResourceFileName } from '../../src/core/api/services/authenticatedResourceModel.ts';
import {
  applyChatTimelineEvent,
  buildChatTimelineDisplayItems,
  normalizeChatTimelineArtifactEvent,
  projectTimelineRuntimeState
} from '../../src/features/chatTimeline/index.ts';

test('artifact normalizer supports live arrays, safe resource URLs and preview strategies', () => {
  const artifacts = normalizeChatTimelineArtifactEvent({
    type: 'artifact.publish',
    runId: 'run-artifact',
    timestamp: 100,
    artifacts: [
      {
        artifactId: 'image-1',
        name: 'diagram.png',
        mimeType: 'image/png',
        size: 2048,
        url: '/api/resource?id=image-1'
      },
      {
        id: 'html-1',
        name: 'report.html',
        mimeType: 'text/html; charset=utf-8',
        url: 'https://example.test/report',
        summary: 'Interactive report source'
      },
      {
        id: 'unsafe-1',
        name: 'unsafe.txt',
        mimeType: 'text/plain',
        url: 'javascript:alert(1)',
        status: 'ready'
      }
    ]
  });

  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0].resourceUrl, '/api/resource?id=image-1');
  assert.equal(artifacts[0].previewKind, 'image');
  assert.equal(artifacts[0].sizeBytes, 2048);
  assert.equal(artifacts[1].previewKind, 'text');
  assert.equal(artifacts[1].mimeType, 'text/html; charset=utf-8');
});

test('artifact reducer creates typed nodes, updates by artifact id and rejects stale replay', () => {
  const event = {
    type: 'artifact.publish',
    runId: 'run-1',
    timestamp: 100,
    artifacts: [
      {
        artifactId: 'artifact-1',
        name: 'architecture.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
        url: '/api/resource?id=artifact-1',
        summary: 'Architecture document'
      },
      {
        artifactId: 'artifact-2',
        name: 'notes.txt',
        mimeType: 'text/plain',
        url: '/api/resource?id=artifact-2'
      }
    ]
  };
  const first = applyChatTimelineEvent(null, 'chat-artifact', event);
  const repeated = applyChatTimelineEvent(first, 'chat-artifact', event);
  const artifacts = first.orderedNodeIds
    .map((nodeId) => first.nodesById[nodeId])
    .filter((node) => node?.kind === 'artifact');

  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0].kind === 'artifact' ? artifacts[0].previewKind : '', 'pdf');
  assert.equal(artifacts[0].kind === 'artifact' ? artifacts[0].status : '', 'ready');
  assert.equal(repeated, first);

  const newer = applyChatTimelineEvent(first, 'chat-artifact', {
    type: 'artifact.publish',
    runId: 'run-2',
    timestamp: 120,
    artifactId: 'artifact-1',
    name: 'architecture-v2.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 8192,
    url: '/api/resource?id=artifact-1-v2',
    summary: 'Updated'
  });
  const ignoredOlder = applyChatTimelineEvent(newer, 'chat-artifact', event);
  const updated = newer.nodesById['artifact:chat-artifact:artifact-1'];

  assert.equal(newer.orderedNodeIds.filter((nodeId) => newer.nodesById[nodeId]?.kind === 'artifact').length, 2);
  assert.equal(updated?.kind === 'artifact' ? updated.name : '', 'architecture-v2.pdf');
  assert.equal(updated?.runId, 'run-2');
  assert.equal(ignoredOlder, newer);
});

test('artifact processing and failure states remain visible without a ready resource URL', () => {
  let state = applyChatTimelineEvent(null, 'chat-artifact-status', {
    type: 'artifact.publish',
    artifactId: 'artifact-processing',
    name: 'draft.csv',
    status: 'processing',
    timestamp: 100
  });
  state = applyChatTimelineEvent(state, 'chat-artifact-status', {
    type: 'artifact.publish',
    artifactId: 'artifact-failed',
    name: 'failed.zip',
    status: 'failed',
    error: 'Archive generation failed',
    timestamp: 110
  });
  const nodes = state.orderedNodeIds.map((nodeId) => state.nodesById[nodeId]);
  const items = buildChatTimelineDisplayItems(state);

  assert.equal(nodes[0].kind === 'artifact' ? nodes[0].status : '', 'processing');
  assert.equal(nodes[0].lifecycle, 'active');
  assert.equal(nodes[1].kind === 'artifact' ? nodes[1].errorReason : '', 'Archive generation failed');
  assert.equal(nodes[1].lifecycle, 'error');
  assert.deepEqual(
    items.map((item) => item.kind),
    ['artifact', 'artifact']
  );
});

test('artifact runtime projection derives compatibility fields without storing duplicate title or body', () => {
  const state = applyChatTimelineEvent(null, 'chat-artifact-runtime', {
    type: 'artifact.publish',
    artifactId: 'artifact-runtime',
    name: 'result.json',
    mimeType: 'application/json',
    url: '/api/resource?id=artifact-runtime',
    summary: 'Structured output',
    timestamp: 100
  });
  const entry = projectTimelineRuntimeState(state).entries[0];

  assert.equal(entry.kind, 'artifact');
  assert.equal(entry.title, 'result.json');
  assert.equal(entry.body, 'Structured output');
  assert.equal(entry.status, 'ready');
});

test('authenticated resource filenames remove path and control characters deterministically', () => {
  assert.equal(
    normalizeAuthenticatedResourceFileName('../quarter\u0000/report:2026?.pdf'),
    '.._quarter_report_2026_.pdf'
  );
  assert.equal(normalizeAuthenticatedResourceFileName('...'), 'artifact');
});
