import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('login defaults to pairing code and keeps skip guidance below the scrollable content', () => {
  const loginScreen = readSource('src/features/auth/LoginScreen.tsx');
  const scrollEndIndex = loginScreen.indexOf('</AppKeyboardAwareScrollView>');
  const footerIndex = loginScreen.indexOf('<View className={FOOTER_CLASS}>');

  assert.match(loginScreen, /useState<PairingMode>\('code'\)/u);
  assert.match(loginScreen, /await loginWithPairingPayload\(normalizedPayload, \{ signal: controller\.signal \}\);/u);
  assert.match(loginScreen, /new AbortController\(\)/u);
  assert.match(loginScreen, /multiline/u);
  assert.match(loginScreen, /handlePastePairingPayload/u);
  assert.doesNotMatch(loginScreen, /readPreferredDeviceName|auth\.device\.label/u);
  assert.ok(scrollEndIndex >= 0);
  assert.ok(footerIndex > scrollEndIndex);
});

test('pairing code, scanner and recent profiles share the AppAccess-driven completion path', () => {
  const loginScreen = readSource('src/features/auth/LoginScreen.tsx');
  const completionStart = loginScreen.indexOf('function completeSuccessfulPairing()');
  const completionEnd = loginScreen.indexOf('\n  }', completionStart);
  const completionBody = loginScreen.slice(completionStart, completionEnd);

  assert.ok(completionStart >= 0);
  assert.match(completionBody, /completeAccessOnboarding\(\)/u);
  assert.doesNotMatch(completionBody, /navigation\.(goBack|reset|navigate)/u);
  assert.match(loginScreen, /submitPairingPayload\(normalizedPairingPayload, 'code'\)/u);
  assert.match(loginScreen, /submitPairingPayload\(data, 'scan'\)/u);
  assert.equal(loginScreen.match(/completeSuccessfulPairing\(\)/gu)?.length, 3);
});

test('scanner is mounted only for scan mode and renders a full-screen QR camera', () => {
  const loginScreen = readSource('src/features/auth/LoginScreen.tsx');
  const scanner = readSource('src/features/auth/FullScreenPairingScanner.tsx');

  assert.match(loginScreen, /pairingMode === 'scan' \? \(/u);
  assert.match(loginScreen, /setPairingMode\('code'\)/u);
  assert.match(scanner, /presentationStyle="fullScreen"/u);
  assert.match(scanner, /statusBarTranslucent/u);
  assert.match(scanner, /<CameraView/u);
  assert.match(scanner, /barcodeTypes: \['qr'\]/u);
  assert.match(scanner, /active=\{!isPaused\}/u);
  assert.match(scanner, /onRequestClose=\{onRequestClose\}/u);
  assert.match(scanner, /usage="authScanner\.close"/u);
  assert.doesNotMatch(scanner, /disabled=/u);
  assert.doesNotMatch(scanner, /accessibilityRole="tablist"|auth\.mode\.code|auth\.mode\.scan/u);
  assert.doesNotMatch(scanner, /fullScreenHint/u);
});

test('scanner pairing stays dismissible and retries after a lightweight error notice', () => {
  const loginScreen = readSource('src/features/auth/LoginScreen.tsx');
  const scanner = readSource('src/features/auth/FullScreenPairingScanner.tsx');

  assert.match(loginScreen, /function handleCloseScanner\(\) \{[\s\S]*cancelPairingAttempt\(\);/u);
  assert.match(loginScreen, /pairingAbortControllerRef\.current\?\.abort\(\)/u);
  assert.match(loginScreen, /showRetryableScannerError\(message\)/u);
  assert.match(loginScreen, /SCANNER_RETRY_DELAY_MS/u);
  assert.match(scanner, /errorMessage \|\| isConnecting/u);
  assert.match(scanner, /pointerEvents="none"/u);
  assert.match(scanner, /accessibilityLiveRegion="polite"/u);
});

test('Me edits device names through the core auth boundary', () => {
  const meScreen = readSource('src/app/screens/MeScreen.tsx');
  const appAuth = readSource('src/core/auth/appAuth.ts');

  assert.match(meScreen, /updatePreferredDeviceName\(normalizedDeviceName\)/u);
  assert.match(meScreen, /readPreferredDeviceName\(effectiveDeviceId\)/u);
  assert.doesNotMatch(meScreen, /new MMKV/u);
  assert.match(appAuth, /DEVICE_NAME_OVERRIDE_KEY/u);
  assert.match(appAuth, /applyDeviceNameToSession\(currentSession, normalizedDeviceName\)/u);
});
