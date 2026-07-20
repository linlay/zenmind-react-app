import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dockSource = readFileSync(
  new URL('../../src/features/chatPersistence/components/awaiting/ChatAwaitingDock.tsx', import.meta.url),
  'utf8'
);
const screenSource = readFileSync(
  new URL('../../src/features/chatPersistence/ChatDetailScreen.tsx', import.meta.url),
  'utf8'
);
const timelineSource = readFileSync(
  new URL('../../src/features/chatPersistence/components/ChatTimelineList.tsx', import.meta.url),
  'utf8'
);
const previewProviderSource = readFileSync(
  new URL('../../src/shared/components/conversationPreview/ConversationPreviewProvider.tsx', import.meta.url),
  'utf8'
);

test('awaiting option preview uses a sibling action that cannot select the option', () => {
  const previewButtonSource = dockSource.slice(
    dockSource.indexOf('const ChoicePreviewButton'),
    dockSource.indexOf('const ChoiceRow')
  );
  const choiceRowSource = dockSource.slice(
    dockSource.indexOf('const ChoiceRow'),
    dockSource.indexOf('function QuestionInput')
  );
  assert.match(dockSource, /previewHtml=\{option\.previewHtml\}/);
  assert.match(
    dockSource,
    /<View[\s\S]*className=\{cn\(OPTION_ROW_CLASS[\s\S]*<Pressable[\s\S]*onPress=\{handlePress\}[\s\S]*<\/Pressable>[\s\S]*\{previewHtml \? \([\s\S]*<ChoicePreviewButton/
  );
  assert.match(previewButtonSource, /openHtmlPreview\(\{ source \}\)/);
  assert.doesNotMatch(previewButtonSource, /onPress\(value\)/);
  assert.doesNotMatch(choiceRowSource, /useConversationPreviewActions/);
});

test('chat detail shares one preview provider across the timeline and awaiting dock', () => {
  assert.match(screenSource, /<ConversationPreviewProvider[\s\S]*<AuthenticatedResourcePreviewProvider[\s>]/);
  assert.match(screenSource, /previewStore=\{conversationPreviewStore\}/);
  assert.doesNotMatch(timelineSource, /<ConversationPreviewProvider/);
  assert.doesNotMatch(timelineSource, /createConversationPreviewVisibilityStore\(/);
  assert.match(previewProviderSource, /htmlOverlay\.scopeKey === scopeKey/);
});

test('awaiting HTML source hashing is lazy and bounded before the secure overlay starts', () => {
  assert.match(previewProviderSource, /sourceHash\?: string/);
  assert.match(
    previewProviderSource,
    /request\.source\.length > CONVERSATION_PREVIEW_MAX_SOURCE_BYTES[\s\S]*`oversized:\$\{request\.source\.length\}`[\s\S]*hashConversationPreviewSource\(request\.source\)/
  );
});
