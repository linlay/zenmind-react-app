import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const timelineSource = readFileSync(
  new URL('../../src/features/chatPersistence/components/ChatTimelineList.tsx', import.meta.url),
  'utf8'
);

function readStyleBlock(name: string, nextName: string): string {
  const start = timelineSource.indexOf(`${name}: {`);
  const end = timelineSource.indexOf(`${nextName}: {`, start);

  assert.ok(start >= 0, `missing ${name} style`);
  assert.ok(end > start, `missing ${nextName} style after ${name}`);
  return timelineSource.slice(start, end);
}

test('assistant reply footer never overlaps the previous FlashList cell', () => {
  const assistantFooterRow = readStyleBlock('assistantFooterRow', 'assistantFooterRailSpacer');
  const messageFooter = readStyleBlock('messageFooter', 'messageFooterEnd');
  const messageFooterEnd = readStyleBlock('messageFooterEnd', 'footerActions');

  assert.doesNotMatch(assistantFooterRow, /marginTop/u);
  assert.doesNotMatch(messageFooter, /marginTop/u);
  assert.match(messageFooterEnd, /marginTop:\s*6/u);
});

test('user attachments render above the message text with spacing below', () => {
  const rowStart = timelineSource.indexOf('const UserQueryRow');
  const rowEnd = timelineSource.indexOf('const RequestInputRow', rowStart);
  const userRow = timelineSource.slice(rowStart, rowEnd);
  const attachmentIndex = userRow.indexOf('<ChatAttachmentStrip attachments={attachments} variant="message" />');
  const textIndex = userRow.indexOf('<ChatConversationMarkdownRenderer');

  assert.ok(rowStart >= 0 && rowEnd > rowStart, 'missing UserQueryRow');
  assert.ok(attachmentIndex >= 0, 'missing user attachment strip');
  assert.ok(textIndex >= 0, 'missing user message text');
  assert.ok(attachmentIndex < textIndex, 'user attachments should render before message text');
  assert.match(timelineSource, /USER_ATTACHMENT_PANEL_BEFORE_TEXT_CLASS = 'mb-\[6px\]'/u);
  assert.doesNotMatch(timelineSource, /USER_ATTACHMENT_PANEL_AFTER_TEXT_CLASS/u);
});
