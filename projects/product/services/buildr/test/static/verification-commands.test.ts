import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { verificationSteps, VERIFICATION_EXECUTION_BOUNDARIES } from '../verification/registry.ts';

const root = path.resolve(import.meta.dirname, '../..');

test('project has one visible command for each supported selection and no retired command aliases', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const [entry, mode] of Object.entries({ test: 'unit', check: 'check', 'test:static': 'static', 'test:integration': 'integration', 'test:e2e': 'e2e', 'test:system': 'system', 'test:related': 'related' })) {
    assert.match(scripts[entry], new RegExp(`test/verification/cli\\.ts ${mode}$`), entry);
  }
  for (const entry of ['test:fast', 'test:core', 'test:daily-full', 'test:component', 'test:contract', 'test:changed', 'test:focus']) assert.equal(scripts[entry], undefined, entry);
});

test('registered checks have exactly one of the four supported types and unique identities', () => {
  assert.deepEqual([...VERIFICATION_EXECUTION_BOUNDARIES].sort(), ['E2E', 'Integration', 'Static', 'Unit']);
  assert.equal(new Set(verificationSteps.map((step: any) => step.id)).size, verificationSteps.length);
  for (const step of verificationSteps) {
    assert.ok(VERIFICATION_EXECUTION_BOUNDARIES.includes(step.testing.executionBoundary), step.id);
    assert.ok(step.name.trim().length > 0, step.id);
  }
});

test('each declared service has source checks for its declared boundary', () => {
  const { testing } = YAML.parse(fs.readFileSync(path.resolve(root, '../../verification.yml'), 'utf8'));
  for (const [id, boundary] of [['buildr-static', 'Static'], ['buildr-unit', 'Unit']]) {
    const entry = testing.find((item: { id: string }) => item.id === id);
    assert.ok(entry?.scope.services.length, `${id}: no declared services`);
    for (const service of entry.scope.services) {
      assert.ok(verificationSteps.some((step: { testing: { ownerScope: string; executionBoundary: string }; target: string }) => step.testing.ownerScope === `service:product/${service}`
        && step.target === 'source' && step.testing.executionBoundary === boundary), `${service}: ${boundary}`);
    }
  }
});
