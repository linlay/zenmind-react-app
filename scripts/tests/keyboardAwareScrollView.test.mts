import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const COMPONENT_PATH = 'src/shared/components/AppKeyboardAwareScrollView.tsx';

test('keyboard-aware scrolling stays a thin native ScrollView policy', () => {
  const source = readSource(COMPONENT_PATH);

  assert.match(source, /forwardRef<ScrollView, AppKeyboardAwareScrollViewProps>/u);
  assert.match(source, /automaticallyAdjustKeyboardInsets = Platform\.OS === 'ios'/u);
  assert.match(source, /keyboardDismissMode = Platform\.OS === 'ios' \? 'interactive' : 'on-drag'/u);
  assert.match(source, /keyboardShouldPersistTaps = 'handled'/u);
  assert.doesNotMatch(
    source,
    /Keyboard\.addListener|useState|measureInWindow|scrollResponderScrollNativeHandleToKeyboard/u
  );
});

test('ordinary app forms share the keyboard-aware scroll policy', () => {
  const meScreen = readSource('src/app/screens/MeScreen.tsx');
  const loginScreen = readSource('src/features/auth/LoginScreen.tsx');
  const taskBoardScreen = readSource('src/features/agentTaskBoard/AgentTaskBoardScreen.tsx');

  for (const source of [meScreen, loginScreen, taskBoardScreen]) {
    assert.match(source, /<AppKeyboardAwareScrollView/u);
    assert.doesNotMatch(source, /<ScrollView/u);
  }

  assert.match(loginScreen, /<KeyboardAvoidingView/u);
});
