import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const composerOptionRowSource = readFileSync(
  new URL('../../src/features/chatPersistence/components/ChatComposerOptionRow.tsx', import.meta.url),
  'utf8'
);
const controllerSource = readFileSync(
  new URL('../../src/features/chatPersistence/useChatDetailConversationController.ts', import.meta.url),
  'utf8'
);
const screenSource = readFileSync(
  new URL('../../src/features/chatPersistence/ChatDetailScreen.tsx', import.meta.url),
  'utf8'
);

test('chat detail delegates settings ownership and forwards only effective query settings', () => {
  assert.match(controllerSource, /useChatComposerSettings/);
  assert.doesNotMatch(
    controllerSource,
    /updateAgentModelConfig|ensureAgentModelOptions|setModelOptionsSnapshot|setAgentDetailSnapshot/
  );
  assert.match(controllerSource, /accessLevel: submitAccessLevel,\s*model: submitModel,/s);
});

test('chat detail screen passes composer query option state into composer card', () => {
  assert.match(screenSource, /composerOptions/);
  assert.match(screenSource, /onAccessLevelChange=\{setAccessLevel\}/);
  assert.match(screenSource, /onModelOverrideChange=\{setModelOverride\}/);
});

test('composer option row localizes desktop model setting labels', () => {
  assert.match(composerOptionRowSource, /composer\.query\.reasoning\.\$\{value\}/);
  assert.match(composerOptionRowSource, /composer\.query\.serviceTier\.STANDARD/);
});

test('composer model panel groups settings and opens model choices inside the same panel', () => {
  assert.match(composerOptionRowSource, /type ModelMenuView = 'settings' \| 'models'/);
  assert.match(
    composerOptionRowSource,
    /const \[modelMenuView, setModelMenuView\] = useState<ModelMenuView>\('settings'\)/
  );
  assert.match(
    composerOptionRowSource,
    /const handleOpenModelList = useCallback\(\(\) => setModelMenuView\('models'\), \[\]\)/
  );
  assert.match(
    composerOptionRowSource,
    /const handleBackToModelSettings = useCallback\(\(\) => setModelMenuView\('settings'\), \[\]\)/
  );
  assert.match(composerOptionRowSource, /MenuNavigationRow/);
  assert.match(composerOptionRowSource, /serviceTiers\.length > 0 \?/);
  assert.match(composerOptionRowSource, /activeMenu === 'model' && modelMenuView === 'models'/);
});

test('composer option row waits for the keyboard to hide before opening a settings panel', () => {
  assert.match(composerOptionRowSource, /import \{[^}]*Keyboard[^}]*Pressable[^}]*ScrollView[^}]*Text[^}]*View/s);
  assert.match(composerOptionRowSource, /const keyboardVisibleRef = useRef\(Keyboard\.isVisible\(\)\)/);
  assert.match(composerOptionRowSource, /const pendingMenuRef = useRef<OptionMenu \| null>\(null\)/);
  assert.match(composerOptionRowSource, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.match(composerOptionRowSource, /Keyboard\.addListener\('keyboardDidHide'/);
  assert.match(
    composerOptionRowSource,
    /if \(keyboardVisibleRef\.current\) \{\s*pendingMenuRef\.current = menu;\s*setModelMenuView\('settings'\);\s*setActiveMenu\(null\);\s*Keyboard\.dismiss\(\);/s
  );
  assert.match(
    composerOptionRowSource,
    /const pendingMenu = pendingMenuRef\.current;\s*pendingMenuRef\.current = null;/
  );
  assert.match(
    composerOptionRowSource,
    /requestAnimationFrame\(\(\) => \{\s*keyboardSettleFrameRef\.current = requestAnimationFrame/s
  );
});
