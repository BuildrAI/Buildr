import assert from 'node:assert/strict';
import test from 'node:test';

import { parseChangedPaths, selectBrowserSelectors } from '../verification/browser-selector-dispatcher.mjs';
import { createVerificationPlan } from '../verification/planner.mjs';

test('Browser dispatcher skips Chrome for HTTP-only Buildr Web changes', () => {
  const plan = selectBrowserSelectors(['src/interfaces/local-app/http/server.mjs']);
  assert.equal(plan.status, 'not-applicable');
  assert.deepEqual(plan.selectors, []);
  assert.match(plan.reasons[0].reason, /HTTP\/API owner/);
});

test('Browser dispatcher selects only affected resource selectors', () => {
  const plan = selectBrowserSelectors([
    'services/buildr-web/src/pages/TaskDetailPage.tsx',
    'services/buildr-web/src/pages/ProjectDetailPage.tsx',
  ]);
  assert.equal(plan.status, 'selected');
  assert.deepEqual(plan.selectors, ['task', 'project']);
  assert.equal(plan.reasons.length, 2);
});

test('Browser dispatcher closes the old zero-selector success for Web package and build config', () => {
  for (const input of [
    'services/buildr-web/package.json',
    'services/buildr-web/package-lock.json',
    'services/buildr-web/vite.config.ts',
    'services/buildr-web/tsconfig.json',
  ]) {
    const plan = selectBrowserSelectors([input]);
    assert.equal(plan.status, 'selected', input);
    assert.equal(plan.mode, 'full', input);
    assert.deepEqual(plan.selectors, ['all'], input);
  }
});

test('Browser dispatcher accepts Project-relative Buildr paths', () => {
  const plan = selectBrowserSelectors(['services/buildr/src/web/application/preview-lifecycle.mjs']);
  assert.equal(plan.status, 'selected');
  assert.deepEqual(plan.selectors, ['shell', 'core']);
});

test('Browser dispatcher uses core fallback for unknown web paths and shared router', () => {
  const unknown = selectBrowserSelectors(['services/buildr-web/src/pages/SettingsPage.tsx']);
  assert.deepEqual(unknown.selectors, ['core']);
  const router = selectBrowserSelectors(['services/buildr-web/src/App.tsx']);
  assert.deepEqual(router.selectors, ['shell', 'core']);
});

test('Browser Smoke and selection mechanism changes choose explicit full selector set', () => {
  assert.deepEqual(selectBrowserSelectors(['test/browser-smoke/local-app-browser.test.mjs']).selectors, ['all']);
  assert.deepEqual(selectBrowserSelectors(['test/verification/registry.mjs']).selectors, ['all']);
});

test('Browser dispatcher accepts explicit input and falls back to Git changed paths', () => {
  const explicit = parseChangedPaths(JSON.stringify(['services/buildr-web/src/App.tsx']));
  assert.deepEqual(explicit, ['services/buildr-web/src/App.tsx']);
  const derived = parseChangedPaths(null);
  assert.ok(Array.isArray(derived));
  assert.ok(derived.every((value) => typeof value === 'string' && value.length > 0));
});

test('Browser dispatcher rejects malformed or unresolvable changed path input', () => {
  assert.throws(() => parseChangedPaths('{bad'), (error) => error.code === 'browser_changed_paths_invalid');
  assert.throws(() => parseChangedPaths('{"paths": [3]}'), (error) => error.code === 'browser_changed_paths_invalid');
  const previousBase = process.env.BUILDR_VERIFICATION_BASE;
  const previousPaths = process.env.BUILDR_CHANGED_PATHS_JSON;
  try {
    delete process.env.BUILDR_CHANGED_PATHS_JSON;
    process.env.BUILDR_VERIFICATION_BASE = '__missing-verification-base__';
    assert.throws(() => parseChangedPaths(), (error) => error.code === 'browser_changed_paths_unresolvable');
  } finally {
    if (previousBase === undefined) delete process.env.BUILDR_VERIFICATION_BASE;
    else process.env.BUILDR_VERIFICATION_BASE = previousBase;
    if (previousPaths === undefined) delete process.env.BUILDR_CHANGED_PATHS_JSON;
    else process.env.BUILDR_CHANGED_PATHS_JSON = previousPaths;
  }
});

test('changed planner gives Buildr Web Runtime HTTP its narrow System owner', () => {
  const plan = createVerificationPlan({ paths: ['src/interfaces/local-app/http/server.mjs'] });
  const ids = plan.steps.map((step) => step.id);
  assert.ok(ids.includes('system-local-app-http'));
  assert.equal(ids.includes('system'), false);
});
