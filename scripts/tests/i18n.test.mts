import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLocale, resolveLocalePreference } from '../../src/shared/i18n/locales.ts';
import { messages } from '../../src/shared/i18n/messages/index.ts';
import { createTranslator, defaultT, translate } from '../../src/shared/i18n/translate.ts';

test('i18n resolves supported locales by exact tag and language family', () => {
  assert.equal(resolveLocale('en-US'), 'en-US');
  assert.equal(resolveLocale('en_GB'), 'en-US');
  assert.equal(resolveLocale('zh-Hant-TW'), 'zh-CN');
  assert.equal(resolveLocale('fr-FR'), 'zh-CN');
});

test('i18n resolves stored preference safely', () => {
  assert.equal(resolveLocalePreference('system'), 'system');
  assert.equal(resolveLocalePreference('en-US'), 'en-US');
  assert.equal(resolveLocalePreference('en-GB'), 'system');
  assert.equal(resolveLocalePreference(null), 'system');
});

test('i18n translates with interpolation and default fallback', () => {
  assert.equal(translate('en-US', 'tabs.chat'), 'Chat');
  assert.equal(createTranslator('en-US')('chatHome.pinned.expand', { count: 3 }), 'Expand pinned items (3)');
  assert.equal(defaultT('chatHome.pinned.expand', { count: 3 }), '展开置顶项目 (3)');
});

test('i18n message tables keep the same key set', () => {
  assert.deepEqual(Object.keys(messages['en-US']).sort(), Object.keys(messages['zh-CN']).sort());
});
