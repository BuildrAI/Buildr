import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSelectionOnlyPackageMetadataChange,
  isVerificationDeclarationMetadataOnlyChange,
  isVersionOnlyPackageMetadataChange,
} from '../../test/verification/changed-paths.ts';
import { createVerificationPlan } from '../../test/verification/planner.ts';

const ids: any = (plan: any) => plan.steps.map((step: any) => step.id);

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
  const affectedPlan: any = createVerificationPlan({ paths: ['package.json', 'package-lock.json'], versionOnlyPackagePaths: ['package.json', 'package-lock.json'] });
  const affected: any = ids(affectedPlan);
  const full: any = createVerificationPlan({ paths: ['package.json'] });
  assert.ok(affected.length > 0);
  assert.ok(affected.length < full.steps.length);
  assert.equal(affectedPlan.scope.mode, 'affected');
  assert.deepEqual(affectedPlan.scope.reasons.map((reason: any) => reason.code), ['version-only-package-metadata', 'version-only-package-metadata']);
  assert.equal(full.scope.mode, 'full');
  assert.ok(full.steps.some((step: any) => step.reasons.some((reason: any) => reason.includes('non-version package metadata changes'))));
});

test('version-only exception is closed to changed package metadata paths', () => {
  assert.throws(
    () => createVerificationPlan({ paths: ['test/verification/registry.ts'], versionOnlyPackagePaths: ['test/verification/registry.ts'] }),
    /Invalid version-only package path/,
  );
  assert.throws(
    () => createVerificationPlan({ paths: ['docs/buildr-product.md'], versionOnlyPackagePaths: ['package.json'] }),
    /not part of the changed paths/,
  );
  assert.throws(
    () => createVerificationPlan({ paths: ['test/verification/registry.ts'], selectionOnlyPaths: ['test/verification/registry.ts'] }),
    /Invalid selection-only metadata path/,
  );
  assert.throws(
    () => createVerificationPlan({ paths: ['docs/buildr-product.md'], selectionOnlyPaths: ['verification.yml'] }),
    /not part of the changed paths/,
  );
});

test('package presentation metadata stays affected while scripts and dependencies force Full', () => {
  const base: any = JSON.stringify({ name: 'buildr', description: 'old', scripts: { test: 'node --test' }, dependencies: { yaml: '1' } });
  assert.equal(isSelectionOnlyPackageMetadataChange('package.json', base, JSON.stringify({ name: 'buildr', description: 'new', scripts: { test: 'node --test' }, dependencies: { yaml: '1' } })), true);
  assert.equal(isSelectionOnlyPackageMetadataChange('package.json', base, JSON.stringify({ name: 'buildr', description: 'old', scripts: { test: 'node test/run.ts' }, dependencies: { yaml: '1' } })), false);
  assert.equal(isSelectionOnlyPackageMetadataChange('package.json', base, JSON.stringify({ name: 'buildr', description: 'old', scripts: { test: 'node --test' }, dependencies: { yaml: '2' } })), false);
});

test('verification presentation metadata stays affected while invocation and environment changes force Full', () => {
  const base: any = `schemaVersion: buildr.project-verification/v3\nresources:\n  - id: browser\n    title: Old\n    strategy: coordinated\n    capacity: 1\n    authorization: implicit\ncapabilities:\n  - id: product.delivery\n    title: Old\n    scope: { project: product, services: [] }\n    proves: [old]\n    evidence: [unit]\n    usableFor: [task-delivery]\n    discovery: { sources: ['**'] }\n    invocation:\n      affected: { kind: command, argv: [npm, test], cwd: . }\n      full: { kind: command, argv: [npm, test], cwd: . }\n    environment: { requires: [] }\n    effects: { writes: [], externalSystems: [], authorization: implicit }\n    resourceClaims: []\n`;
  const presentation: any = base.replaceAll('Old', 'New').replace('proves: [old]', 'proves: [new]');
  assert.equal(isVerificationDeclarationMetadataOnlyChange(base, presentation), true);
  assert.equal(isVerificationDeclarationMetadataOnlyChange(base, base.replace('argv: [npm, test]', 'argv: [npm, run, test:changed]')), false);
  assert.equal(isVerificationDeclarationMetadataOnlyChange(base, `${base}    environment:\n      requires: [node]\n`), false);
});
