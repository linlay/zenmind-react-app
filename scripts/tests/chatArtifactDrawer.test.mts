import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildChatTimelineMainDisplayItems,
  selectChatTimelineArtifacts
} from '../../src/features/chatPersistence/chatArtifactPresentation.ts';
import { buildChatTimelineDisplayItems, deriveChatTimelineState } from '../../src/features/chatTimeline/index.ts';

test('mobile artifact presentation removes inline cards and repairs timeline rail framing', () => {
  const state = deriveChatTimelineState('chat-artifact-drawer', [
    {
      type: 'request.query',
      requestId: 'request-1',
      runId: 'run-1',
      message: '生成两个文件',
      timestamp: 100
    },
    {
      type: 'artifact.publish',
      runId: 'run-1',
      timestamp: 110,
      artifacts: [
        {
          artifactId: 'artifact-json',
          name: 'result.json',
          mimeType: 'application/json',
          url: '/api/resource?id=artifact-json'
        },
        {
          artifactId: 'artifact-markdown',
          name: 'result.md',
          mimeType: 'text/markdown',
          url: '/api/resource?id=artifact-markdown'
        }
      ]
    },
    {
      type: 'content.snapshot',
      contentId: 'answer-1',
      runId: 'run-1',
      text: '文件已生成。',
      timestamp: 120
    },
    {
      type: 'run.complete',
      runId: 'run-1',
      timestamp: 130
    }
  ]);

  const artifacts = selectChatTimelineArtifacts(state);
  const mainItems = buildChatTimelineMainDisplayItems(buildChatTimelineDisplayItems(state));
  const framedItems = mainItems.filter((item) => item.kind !== 'assistant-reply-footer');

  assert.deepEqual(
    artifacts.map((artifact) => artifact.name),
    ['result.json', 'result.md']
  );
  assert.deepEqual(
    mainItems.map((item) => item.kind),
    ['user-query', 'assistant-content', 'assistant-reply-footer']
  );
  assert.equal(framedItems[0]?.isFirstInRun, true);
  assert.equal(framedItems[0]?.isLastInRun, false);
  assert.equal(framedItems[0]?.groupIndex, 0);
  assert.equal(framedItems[1]?.isFirstInRun, false);
  assert.equal(framedItems[1]?.isLastInRun, true);
  assert.equal(framedItems[1]?.groupIndex, 1);
});

test('chat detail mounts the artifact drawer outside keyboard content and wires the timeline shortcut', () => {
  const screenSource = readFileSync('src/features/chatPersistence/ChatDetailScreen.tsx', 'utf8');
  const timelineSource = readFileSync('src/features/chatPersistence/components/ChatTimelineList.tsx', 'utf8');
  const drawerRenderIndex = screenSource.lastIndexOf('<ChatArtifactDrawer');
  const keyboardContentEndIndex = screenSource.indexOf('</ChatDetailKeyboardAvoider>');

  assert.ok(drawerRenderIndex > keyboardContentEndIndex);
  assert.match(screenSource, /artifactCount=\{artifacts\.length\}/);
  assert.match(screenSource, /onOpenArtifacts=\{handleOpenArtifactDrawer\}/);
  assert.match(timelineSource, /buildChatTimelineMainDisplayItems\(displayModel\.items\)/);
  assert.match(timelineSource, /<ChatArtifactShortcut count=\{artifactCount\} onPress=\{onOpenArtifacts\}/);
});
