import assert from 'node:assert/strict';
import test from 'node:test';
import { isVersionOnlyPackageMetadataChange } from '../../test/verification/changed-paths.mjs';
import { createVerificationPlan } from '../../test/verification/planner.mjs';

const ids = (plan) => plan.steps.map((step) => step.id);

test('package metadata semantic classifier only permits the three version fields', () => {
  assert.equal(isVersionOnlyPackageMetadataChange(
    'package.json',
    JSON.stringify({ name: 'demo', version: '1.0.0', scripts: { test: 'node --test' } }),
    JSON.stringify({ name: 'demo', version: '1.0.1', scripts: { test: 'node --test' } }),
  ), true);
  assert.equal(isVersionOnlyPackageMetadataChange(
    'package-lock.json',
    JSON.stringify({ version: '1.0.0', packages: { '': { version: '1.0.0', dependencies: { a: '1' } }, 'node_modules/a': { version: '1' } } }),
    JSON.stringify({ version: '1.0.1', packages: { '': { version: '1.0.1', dependencies: { a: '1' } }, 'node_modules/a': { version: '1' } } }),
  ), true);
  assert.equal(isVersionOnlyPackageMetadataChange(
    'package.json',
    JSON.stringify({ version: '1.0.0', scripts: { test: 'old' } }),
    JSON.stringify({ version: '1.0.1', scripts: { test: 'new' } }),
  ), false);
  assert.equal(isVersionOnlyPackageMetadataChange('package.json', '{', '{}'), false);
});

test('version-only paths use affected owners while unverified package paths stay full-scope', () => {
  const affected = ids(createVerificationPlan({ paths: ['package.json', 'package-lock.json'], fullScopeExemptPaths: ['package.json', 'package-lock.json'] }));
  const full = createVerificationPlan({ paths: ['package.json'] });
  assert.ok(affected.length > 0);
  assert.ok(affected.length < full.steps.length);
  assert.ok(full.steps.some((step) => step.reasons.some((reason) => reason.includes('non-version package metadata changes'))));
});
