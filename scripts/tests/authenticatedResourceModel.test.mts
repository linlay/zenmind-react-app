import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isAuthenticatedResourceContentTypeCompatible,
  requiresAuthenticatedResourceHttpDataPlane
} from '../../src/core/api/services/authenticatedResourceModel.ts';

test('relative artifact and workspace URLs require the resource HTTP data plane', () => {
  assert.equal(
    requiresAuthenticatedResourceHttpDataPlane('/ap/api/resource?file=chat%2Freport.md'),
    true
  );
  assert.equal(requiresAuthenticatedResourceHttpDataPlane('/api/workspace/file?path=README.md'), true);
  assert.equal(
    requiresAuthenticatedResourceHttpDataPlane('https://cdn.example.test/report.md'),
    false
  );
});

test('HTML app-shell responses are rejected for non-HTML resources', () => {
  assert.equal(isAuthenticatedResourceContentTypeCompatible('report.md', 'text/html; charset=utf-8'), false);
  assert.equal(isAuthenticatedResourceContentTypeCompatible('report.md', 'text/markdown'), true);
  assert.equal(isAuthenticatedResourceContentTypeCompatible('preview.html', 'text/html'), true);
});
