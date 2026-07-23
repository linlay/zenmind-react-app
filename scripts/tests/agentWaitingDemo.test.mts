import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('agent waiting preview exposes five themed animation variants', () => {
  const indicator = readSource('src/features/chatPersistence/components/ChatResponseWaitingIndicator.tsx');
  const demoScreen = readSource('src/app/screens/AgentWaitingDemoScreen.tsx');
  const timelineList = readSource('src/features/chatPersistence/components/ChatTimelineList.tsx');
  const visualShellSource = indicator.slice(
    indicator.indexOf('const VISUAL_SHELL_CLASS'),
    indicator.indexOf('const PULSE_RING_CLASS')
  );

  for (const variant of ['orbit', 'pulse', 'wave', 'typing', 'scan']) {
    assert.match(indicator, new RegExp(`'${variant}'`));
    assert.match(demoScreen, new RegExp(`variant: '${variant}'`));
  }

  assert.match(indicator, /useNativeDriver: true/u);
  assert.match(indicator, /accessibilityRole="progressbar"/u);
  assert.match(indicator, /h-12 w-full shrink-0 items-center justify-center/u);
  assert.doesNotMatch(visualShellSource, /bg-app-/u);

  const listFooterSource = timelineList.slice(
    timelineList.indexOf('const listFooter = useMemo('),
    timelineList.indexOf('const listExtraData')
  );
  const flashListEndIndex = timelineList.indexOf('      />', timelineList.indexOf('<FlashList'));
  const waitingIndicatorIndex = timelineList.indexOf('{waitingIndicatorDocked ? (');
  const scrollToEndIndex = timelineList.indexOf('{showScrollToEnd ? (');
  const dockedWaitingSource = timelineList.slice(waitingIndicatorIndex, scrollToEndIndex);

  assert.match(listFooterSource, /waitingIndicatorInTimelineFooter/u);
  assert.match(listFooterSource, /<ChatResponseWaitingIndicator variant="orbit" \/>/u);
  assert.ok(flashListEndIndex >= 0);
  assert.ok(waitingIndicatorIndex > flashListEndIndex);
  assert.ok(scrollToEndIndex > waitingIndicatorIndex);
  assert.match(dockedWaitingSource, /className=\{WAITING_DOCK_CLASS\}/u);
  assert.match(dockedWaitingSource, /style=\{waitingDockStyle\}/u);
  assert.match(dockedWaitingSource, /<ChatResponseWaitingIndicator variant="orbit" \/>/u);
  assert.doesNotMatch(indicator, /ActivityIndicator/u);
  assert.doesNotMatch(indicator, /<Text/u);
});

test('agent waiting preview is registered as a secondary route from Me', () => {
  const rootTypes = readSource('src/app/navigation/types.ts');
  const rootNavigator = readSource('src/app/navigation/RootNavigator.tsx');
  const meScreen = readSource('src/app/screens/MeScreen.tsx');

  assert.match(rootTypes, /AgentWaitingDemo: undefined/u);
  assert.match(rootNavigator, /name="AgentWaitingDemo"/u);
  assert.match(rootNavigator, /component=\{AgentWaitingDemoScreen\}/u);
  assert.match(meScreen, /navigation\.navigate\('AgentWaitingDemo'\)/u);
});
