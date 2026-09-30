import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(appRoot, relativePath), 'utf8');
}

test('settings exposes account, Desktop, and conversation cache actions without direct storage access', () => {
  const settings = readSource('src/app/screens/SettingsScreen.tsx');
  const actions = readSource('src/app/settings/settingsActions.ts');

  assert.match(settings, /clearSettingsAccountCache/u);
  assert.match(settings, /clearSettingsDesktopCache/u);
  assert.match(settings, /clearSettingsConversationCache/u);
  assert.match(settings, /Alert\.alert/u);
  assert.doesNotMatch(settings, /expo-sqlite|react-native-mmkv|chatRepository|database\.ts/u);
  assert.match(actions, /candidate\.accountId === normalizedCurrentAccountId/u);
  assert.match(actions, /conversations: canReadConversationMetadata \? inventory\.conversations : \[\]/u);
  assert.match(actions, /listPersistedUnassignedLegacyCacheScopes/u);
});

test('scoped cache clearing stops realtime only for the current scope and reports idempotent missing databases', () => {
  const service = readSource('src/features/chatRealtime/chatSyncService.ts');
  const repository = readSource('src/features/chatPersistence/chatRepository.ts');
  const database = readSource('src/features/chatPersistence/database.ts');
  const methodStart = service.indexOf('async clearLocalCacheScope');
  const methodEnd = service.indexOf('async clearLocalConversationCache', methodStart);
  const method = service.slice(methodStart, methodEnd);

  assert.match(method, /if \(active\) \{\s*this\.stop\(\)/u);
  assert.match(method, /status: 'success'/u);
  assert.match(method, /status: 'error'/u);
  assert.match(repository, /if \(normalizedScopeId === getChatCacheScopeId\(\)\)/u);
  assert.match(repository, /deleteChatDatabaseScopeIfExists\(normalizedScopeId\)/u);
  assert.match(database, /return 'missing'/u);
});
