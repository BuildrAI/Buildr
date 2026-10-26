import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { verificationSteps, VERIFICATION_EXECUTION_BOUNDARIES } from '../verification/registry.ts';

const root = path.resolve(import.meta.dirname, '../..');

test('project has one visible command for each supported selection and no retired command aliases', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const [entry, mode] of Object.entries({ test: 'unit', check: 'check', 'test:static': 'static', 'test:integration': 'integration', 'test:e2e': 'e2e', 'test:related': 'related' })) {
    assert.match(scripts[entry], new RegExp(`test/verification/cli\\.ts ${mode}$`), entry);
  }
  for (const entry of ['test:fast', 'test:core', 'test:daily-full', 'test:component', 'test:contract', 'test:system', 'test:changed', 'test:focus']) assert.equal(scripts[entry], undefined, entry);
});

test('registered checks have exactly one of the four supported types and unique identities', () => {
  assert.deepEqual([...VERIFICATION_EXECUTION_BOUNDARIES].sort(), ['E2E', 'Integration', 'Static', 'Unit']);
  assert.equal(new Set(verificationSteps.map((step: any) => step.id)).size, verificationSteps.length);
  for (const step of verificationSteps) {
    assert.ok(VERIFICATION_EXECUTION_BOUNDARIES.includes(step.testing.executionBoundary), step.id);
    assert.ok(step.name.trim().length > 0, step.id);
  }
});

test('all four services expose independent source static and unit checks', () => {
  for (const service of ['buildr', 'buildr-web', 'buildr-agent', 'dsh-plugin']) {
    const own = verificationSteps.filter((step: any) => step.testing.ownerScope === `service:product/${service}` && step.target === 'source');
    assert.ok(own.some((step: any) => step.testing.executionBoundary === 'Unit'), `${service}: unit`);
    assert.ok(own.some((step: any) => step.testing.executionBoundary === 'Static'), `${service}: static`);
  }
});
