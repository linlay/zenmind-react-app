import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const composerSource = readFileSync(
  new URL('../../src/features/chatPersistence/components/Composer.tsx', import.meta.url),
  'utf8'
);
const composerCardSource = readFileSync(
  new URL('../../src/features/chatPersistence/components/ChatDetailComposerCard.tsx', import.meta.url),
  'utf8'
);
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

test('chat detail composer renders option row above composer', () => {
  assert.match(composerCardSource, /import \{ ChatComposerOptionRow/);
  assert.match(composerCardSource, /<ChatComposerOptionRow[\s\S]+<Composer/);
});

test('composer keeps selected attachments inside the input surface', () => {
  assert.doesNotMatch(composerSource, /COMPOSER_ATTACHMENT_STRIP_HEIGHT/);
  assert.match(composerSource, /attachments\.length > 0 \? COMPOSER_ATTACHMENT_TILE_HEIGHT : 0/);
  assert.match(composerSource, /<Animated\.View[\s\S]+<ChatAttachmentStrip[\s\S]+<Animated\.View className=\{INPUT_FRAME_CLASS\}/);
});

test('composer pins selected attachments to the top of the input surface', () => {
  assert.match(composerSource, /COMPOSER_ATTACHMENT_TILE_HEIGHT = 58/);
  assert.match(composerSource, /ATTACHMENT_STRIP_FRAME_CLASS = 'absolute left-app-md right-app-md top-app-md h-\[58px\]'/);
  assert.doesNotMatch(composerSource, /ATTACHMENT_STRIP_FRAME_CLASS = '[^']*justify-center/);
});

test('chat detail controller stores composer query options and forwards them on send', () => {
  assert.match(controllerSource, /const \[accessLevel, setAccessLevel\]/);
  assert.match(controllerSource, /const \[modelOverride, setModelOverride\]/);
  assert.match(controllerSource, /ensureAgentModelOptions/);
  assert.match(controllerSource, /updateAgentModelConfig/);
  assert.match(controllerSource, /modelConfigUpdateIdRef\.current \+= 1;\s*\}, \[composerAgentKey\]\)/s);
  assert.match(controllerSource, /getQueryModelOverrideSignature\(modelOverride\)/);
  assert.match(controllerSource, /buildAgentModelConfigPayload\('', value\)/);
  assert.match(controllerSource, /setModelOverride\(nextOverride\)/);
  assert.doesNotMatch(controllerSource, /setModelOverride\(previousOverride\)/);
  assert.match(controllerSource, /accessLevel,\s*model: modelOverride,\s*planningMode/s);
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

test('composer model chip shows model and reasoning while hiding standard-only speed mode', () => {
  assert.match(composerOptionRowSource, /const shouldShowServiceTierInChip = selectedServiceTier !== 'STANDARD' \|\| serviceTiers\.length > 1/);
  assert.match(composerOptionRowSource, /const modelChipLabelParts = \[/);
  assert.match(composerOptionRowSource, /getReasoningLabel\(selectedReasoning, t\)/);
  assert.match(composerOptionRowSource, /shouldShowServiceTierInChip \? getServiceTierChipLabel\(selectedServiceTier, t\) : ''/);
  assert.match(composerOptionRowSource, /modelChipLabelParts\.filter\(Boolean\)\.join\(' · '\)/);
});

test('composer model popover groups settings and opens model choices inside the same popover', () => {
  assert.match(composerOptionRowSource, /type ModelMenuView = 'settings' \| 'models'/);
  assert.match(composerOptionRowSource, /const \[modelMenuView, setModelMenuView\] = useState<ModelMenuView>\('settings'\)/);
  assert.match(composerOptionRowSource, /const handleOpenModelList = useCallback\(\(\) => setModelMenuView\('models'\), \[\]\)/);
  assert.match(composerOptionRowSource, /const handleBackToModelSettings = useCallback\(\(\) => setModelMenuView\('settings'\), \[\]\)/);
  assert.match(composerOptionRowSource, /MenuNavigationRow/);
  assert.match(composerOptionRowSource, /serviceTiers\.length > 0 \?/);
  assert.match(composerOptionRowSource, /activeMenu === 'model' && modelMenuView === 'models'/);
  assert.match(composerOptionRowSource, /onPress=\{handleBackToModelSettings\}/);
});

test('composer model list keeps the return row outside the scroll responder and fully tappable', () => {
  assert.match(composerOptionRowSource, /const isModelListMenu = activeMenu === 'model' && modelMenuView === 'models'/);
  assert.match(composerOptionRowSource, /function MenuScrollView\(\{ children \}: MenuScrollViewProps\)/);
  assert.match(composerOptionRowSource, /const MENU_HEADER_CLASS = '[^']*bg-app-surface-raised[^']*active:bg-app-surface-muted[^']*'/);
  assert.match(
    composerOptionRowSource,
    /\{isModelListMenu \? \(\s*<>\s*<Pressable\s+accessibilityLabel=\{t\('composer\.query\.model\.back'\)\}\s+accessibilityRole="button"\s+className=\{MENU_HEADER_CLASS\}\s+onPress=\{handleBackToModelSettings\}/
  );
  assert.match(composerOptionRowSource, /<MenuScrollView>\s*<View className=\{MENU_SECTION_CLASS\}>\s*\{models\.length > 0 \?/);
  assert.equal((composerOptionRowSource.match(/className=\{MENU_SCROLL_CLASS\}/g) || []).length, 1);
  assert.doesNotMatch(composerOptionRowSource, /stickyHeaderIndices=/);
  assert.doesNotMatch(
    composerOptionRowSource,
    /className=\{MENU_BACK_BUTTON_CLASS\}[\s\S]+onPress=\{handleBackToModelSettings\}/
  );
});

test('composer option row opens settings in an elevated floating popover', () => {
  assert.match(composerOptionRowSource, /MENU_POPOVER_CONTAINER_CLASS = '[^']*absolute[^']*bottom-\[48px\][^']*z-\[30\]/);
  assert.match(composerOptionRowSource, /POPOVER_ELEVATION_STYLE/);
  assert.match(composerOptionRowSource, /shadowColor: theme\.colors\.shadow/);
  assert.match(composerOptionRowSource, /MenuChoiceRow/);
  assert.doesNotMatch(composerOptionRowSource, /<View className=\{MENU_PANEL_CLASS\}>\s*<ScrollView/s);
});

test('composer option row closes the floating popover from an outside tap backdrop', () => {
  assert.match(composerOptionRowSource, /import \{[^}]*Modal[^}]*Pressable[^}]*ScrollView[^}]*Text[^}]*View/s);
  assert.match(composerOptionRowSource, /MENU_DISMISS_BACKDROP_CLASS = 'absolute inset-0 z-\[20\]'/);
  assert.match(composerOptionRowSource, /const handleDismissMenu = useCallback\(\(\) => \{\s*pendingMenuRef\.current = null;\s*setModelMenuView\('settings'\);\s*setActiveMenu\(null\);/s);
  assert.match(composerOptionRowSource, /<Modal[\s\S]+transparent[\s\S]+onRequestClose=\{handleDismissMenu\}/);
  assert.match(composerOptionRowSource, /<Pressable[\s\S]+className=\{MENU_DISMISS_BACKDROP_CLASS\}[\s\S]+onPress=\{handleDismissMenu\}/);
});

test('composer option row waits for the keyboard to hide before opening a floating popover', () => {
  assert.match(composerOptionRowSource, /import \{[^}]*Keyboard[^}]*Modal[^}]*Pressable[^}]*ScrollView[^}]*Text[^}]*View/s);
  assert.match(composerOptionRowSource, /const keyboardVisibleRef = useRef\(Keyboard\.isVisible\(\)\)/);
  assert.match(composerOptionRowSource, /const pendingMenuRef = useRef<OptionMenu \| null>\(null\)/);
  assert.match(composerOptionRowSource, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.match(composerOptionRowSource, /Keyboard\.addListener\('keyboardDidHide'/);
  assert.match(composerOptionRowSource, /if \(keyboardVisibleRef\.current\) \{\s*pendingMenuRef\.current = menu;\s*setModelMenuView\('settings'\);\s*setActiveMenu\(null\);\s*Keyboard\.dismiss\(\);/s);
  assert.match(composerOptionRowSource, /const pendingMenu = pendingMenuRef\.current;\s*pendingMenuRef\.current = null;/);
  assert.match(composerOptionRowSource, /requestAnimationFrame\(\(\) => \{\s*keyboardSettleFrameRef\.current = requestAnimationFrame/s);
});
