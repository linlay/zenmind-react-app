import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(appRoot, relativePath), 'utf8');
}

test('settings renders one scoped cache action per profile with a legacy fallback', () => {
  const settings = readSource('src/app/screens/SettingsScreen.tsx');

  assert.match(settings, /deviceProfiles\.map/u);
  assert.match(settings, /cacheProfiles\.map/u);
  assert.match(settings, /clearSettingsProfileCache\(profile\.cacheScopeId/u);
  assert.match(settings, /SETTINGS_LEGACY_CACHE_SCOPE_ID/u);
  assert.doesNotMatch(settings, /clearSettingsLocalCache/u);
});

test('scoped cache clearing stops realtime only for the current scope and reports idempotent missing databases', () => {
  const service = readSource('src/features/chatRealtime/chatSyncService.ts');
  const repository = readSource('src/features/chatPersistence/chatRepository.ts');
  const database = readSource('src/features/chatPersistence/database.ts');
  const methodStart = service.indexOf('async clearLocalCacheScope');
  const methodEnd = service.indexOf('async collectConversationDiagnosticData', methodStart);
  const method = service.slice(methodStart, methodEnd);

  assert.match(method, /if \(active\) \{\s*this\.stop\(\)/u);
  assert.match(method, /status: 'success'/u);
  assert.match(method, /status: 'error'/u);
  assert.match(repository, /if \(normalizedScopeId === getChatCacheScopeId\(\)\)/u);
  assert.match(repository, /deleteChatDatabaseScopeIfExists\(normalizedScopeId\)/u);
  assert.match(database, /return 'missing'/u);
});
