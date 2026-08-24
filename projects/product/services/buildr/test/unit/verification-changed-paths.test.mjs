import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSelectionOnlyPackageMetadataChange,
  isVerificationDeclarationMetadataOnlyChange,
  isVersionOnlyPackageMetadataChange,
} from '../../test/verification/changed-paths.mjs';
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
  const affectedPlan = createVerificationPlan({ paths: ['package.json', 'package-lock.json'], versionOnlyPackagePaths: ['package.json', 'package-lock.json'] });
  const affected = ids(affectedPlan);
  const full = createVerificationPlan({ paths: ['package.json'] });
  assert.ok(affected.length > 0);
  assert.ok(affected.length < full.steps.length);
  assert.equal(affectedPlan.scope.mode, 'affected');
  assert.deepEqual(affectedPlan.scope.reasons.map((reason) => reason.code), ['version-only-package-metadata', 'version-only-package-metadata']);
  assert.equal(full.scope.mode, 'full');
  assert.ok(full.steps.some((step) => step.reasons.some((reason) => reason.includes('non-version package metadata changes'))));
});

test('version-only exception is closed to changed package metadata paths', () => {
  assert.throws(
    () => createVerificationPlan({ paths: ['test/verification/registry.mjs'], versionOnlyPackagePaths: ['test/verification/registry.mjs'] }),
    /Invalid version-only package path/,
  );
  assert.throws(
    () => createVerificationPlan({ paths: ['docs/buildr-product.md'], versionOnlyPackagePaths: ['package.json'] }),
    /not part of the changed paths/,
  );
  assert.throws(
    () => createVerificationPlan({ paths: ['test/verification/registry.mjs'], selectionOnlyPaths: ['test/verification/registry.mjs'] }),
    /Invalid selection-only metadata path/,
  );
  assert.throws(
    () => createVerificationPlan({ paths: ['docs/buildr-product.md'], selectionOnlyPaths: ['verification.yml'] }),
    /not part of the changed paths/,
  );
});

test('package presentation metadata stays affected while scripts and dependencies force Full', () => {
  const base = JSON.stringify({ name: 'buildr', description: 'old', scripts: { test: 'node --test' }, dependencies: { yaml: '1' } });
  assert.equal(isSelectionOnlyPackageMetadataChange('package.json', base, JSON.stringify({ name: 'buildr', description: 'new', scripts: { test: 'node --test' }, dependencies: { yaml: '1' } })), true);
  assert.equal(isSelectionOnlyPackageMetadataChange('package.json', base, JSON.stringify({ name: 'buildr', description: 'old', scripts: { test: 'node test/run.mjs' }, dependencies: { yaml: '1' } })), false);
  assert.equal(isSelectionOnlyPackageMetadataChange('package.json', base, JSON.stringify({ name: 'buildr', description: 'old', scripts: { test: 'node --test' }, dependencies: { yaml: '2' } })), false);
});

test('verification presentation metadata stays affected while invocation and environment changes force Full', () => {
  const base = `schemaVersion: buildr.project-verification/v2\nresources:\n  - id: browser\n    title: Old\ncapabilities:\n  - id: product.delivery\n    title: Old\n    invocation:\n      kind: command\n      argv: [npm, test]\n    proves: [old]\n    applicability:\n      paths: ['**']\n      conditions: [old]\n`;
  const presentation = base.replaceAll('Old', 'New').replace('proves: [old]', 'proves: [new]').replace('conditions: [old]', 'conditions: [new]');
  assert.equal(isVerificationDeclarationMetadataOnlyChange(base, presentation), true);
  assert.equal(isVerificationDeclarationMetadataOnlyChange(base, base.replace('argv: [npm, test]', 'argv: [npm, run, test:changed]')), false);
  assert.equal(isVerificationDeclarationMetadataOnlyChange(base, `${base}    environment:\n      requires: [node]\n`), false);
});
