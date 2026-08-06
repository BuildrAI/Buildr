import assert from 'node:assert/strict';
import test from 'node:test';

import { parseChangedPaths, selectBrowserSelectors } from '../verification/browser-selector-dispatcher.mjs';
import { createVerificationPlan } from '../verification/planner.mjs';

test('Browser dispatcher skips Chrome for HTTP-only Local App changes', () => {
  const plan = selectBrowserSelectors(['src/interfaces/local-app/http/server.mjs']);
  assert.deepEqual(plan.selectors, []);
  assert.match(plan.reasons[0].reason, /HTTP\/API owner/);
});

test('Browser dispatcher selects only affected resource selectors', () => {
  const plan = selectBrowserSelectors([
    'src/interfaces/local-app/web/features/task-detail.js',
    'src/interfaces/local-app/web/features/project-detail.js',
  ]);
  assert.deepEqual(plan.selectors, ['task', 'project']);
  assert.equal(plan.reasons.length, 2);
});

test('Browser dispatcher uses core fallback for unknown web paths and shared router', () => {
  const unknown = selectBrowserSelectors(['src/interfaces/local-app/web/features/settings.js']);
  assert.deepEqual(unknown.selectors, ['core']);
  const router = selectBrowserSelectors(['src/interfaces/local-app/web/router.js']);
  assert.deepEqual(router.selectors, ['shell', 'core']);
});

test('Browser Smoke and selection mechanism changes choose explicit full selector set', () => {
  assert.deepEqual(selectBrowserSelectors(['test/browser-smoke/local-app-browser.test.mjs']).selectors, ['all']);
  assert.deepEqual(selectBrowserSelectors(['test/verification/registry.mjs']).selectors, ['all']);
});

test('Browser dispatcher rejects absent or malformed changed path input', () => {
  assert.throws(() => parseChangedPaths(), (error) => error.code === 'browser_changed_paths_missing');
  assert.throws(() => parseChangedPaths('{bad'), (error) => error.code === 'browser_changed_paths_invalid');
  assert.throws(() => parseChangedPaths('{"paths": [3]}'), (error) => error.code === 'browser_changed_paths_invalid');
});

test('changed planner gives Local App HTTP its narrow System owner', () => {
  const plan = createVerificationPlan({ paths: ['src/interfaces/local-app/http/server.mjs'] });
  const ids = plan.steps.map((step) => step.id);
  assert.ok(ids.includes('system-local-app-http'));
  assert.equal(ids.includes('system'), false);
});
