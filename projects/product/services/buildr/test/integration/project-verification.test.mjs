import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import {
  createProjectVerificationDiagnostics,
  normalizeProjectVerification,
  parseProjectVerification,
  validateProjectVerification,
} from '../../src/verification/application/project-verification-diagnostics.mjs';
import {
  normalizeProjectEnvironmentPreparation,
  parseProjectEnvironmentPreparation,
  projectEnvironmentPreparationScopeSelector,
} from '../../src/task/module.mjs';

const projectEnvironmentPreparation = Object.freeze({
  normalizeProjectEnvironmentPreparation,
  parseProjectEnvironmentPreparation,
  projectEnvironmentPreparationScopeSelector,
});

function capability(overrides = {}) {
  return {
    id: 'demo.unit',
    title: 'Demo unit tests',
    scope: { project: 'demo', services: [] },
    proves: ['Demo domain behavior'],
    evidence: ['unit'],
    usableFor: ['task-delivery'],
    discovery: { sources: ['package.json', 'services/demo/**'] },
    invocation: { full: { kind: 'command', argv: ['npm', 'test'], cwd: '.' } },
    environment: { requires: ['node'] },
    effects: { writes: ['coverage'], externalSystems: [], authorization: 'implicit' },
    resourceClaims: [],
    ...overrides,
  };
}

function declaration(overrides = {}) {
  return {
    schemaVersion: 'buildr.project-verification/v3',
    resources: [],
    capabilities: [capability()],
    ...overrides,
  };
}

function legacyDeclaration(overrides = {}) {
  return {
    schemaVersion: 'buildr.project-verification/v2',
    resources: [],
    capabilities: [{
      id: 'demo.delivery',
      title: 'Demo legacy delivery',
      scope: { project: 'demo', services: [] },
      invocation: { kind: 'command', argv: ['npm', 'test'], cwd: '.' },
      applicability: { paths: ['package.json', 'services/demo/**'], conditions: ['Legacy transition only'] },
      proves: ['Legacy declared behavior'],
      requiredForDelivery: true,
      environment: { requires: ['node'] },
      effects: { writes: [], externalSystems: [], authorization: 'implicit' },
      resourceClaims: [],
    }],
    ...overrides,
  };
}

test('Project verification v3 接受 affected/full command、provider 与 bounded Agent 能力', () => {
  const value = declaration();
  delete value.resources;
  delete value.capabilities[0].title;
  delete value.capabilities[0].environment;
  delete value.capabilities[0].effects;
  delete value.capabilities[0].resourceClaims;
  value.capabilities.push(capability({
    id: 'demo.acceptance',
    evidence: ['system'],
    usableFor: ['task-delivery', 'product-candidate'],
    invocation: { full: { kind: 'agent', instructions: ['Inspect the existing bounded acceptance workflow', 'Return observed facts only'] } },
  }));
  value.capabilities.push(capability({
    id: 'demo.provider',
    evidence: ['unit', 'integration'],
    discovery: { sources: ['test/verification/registry.mjs'] },
    invocation: { affected: { kind: 'provider', provider: 'demo.registry' }, full: { kind: 'provider', provider: 'demo.registry' } },
  }));
  assert.deepEqual(validateProjectVerification(value, { projectCode: 'demo', services: [] }), []);
  assert.deepEqual(parseProjectVerification(YAML.stringify(value)), value);
  const normalized = normalizeProjectVerification(value, { projectCode: 'demo', services: [] });
  assert.equal(normalized.schemaVersion, 'buildr.project-verification/v3');
  assert.equal(normalized.capabilities[0].invocation.full.cwd, '.');
  assert.deepEqual(normalized.resources, []);
});

test('Project verification v2 在有界过渡期封闭映射为 full-only Task Delivery 能力', () => {
  const value = legacyDeclaration();
  assert.deepEqual(validateProjectVerification(value, { projectCode: 'demo', services: [] }), []);
  const normalized = normalizeProjectVerification(value, { projectCode: 'demo', services: [] });
  assert.equal(normalized.schemaVersion, 'buildr.project-verification/v3');
  assert.equal(normalized.sourceSchemaVersion, 'buildr.project-verification/v2');
  assert.deepEqual(normalized.capabilities[0].evidence, ['legacy-declared']);
  assert.deepEqual(normalized.capabilities[0].usableFor, ['task-delivery']);
  assert.deepEqual(normalized.capabilities[0].discovery.sources, ['package.json', 'services/demo/**']);
  assert.equal(normalized.capabilities[0].invocation.affected, undefined);
  assert.deepEqual(normalized.capabilities[0].invocation.full, { kind: 'command', argv: ['npm', 'test'], cwd: '.' });

  value.capabilities[0].requiredForDelivery = false;
  assert.deepEqual(normalizeProjectVerification(value, { projectCode: 'demo', services: [] }).capabilities[0].usableFor, []);
});

test('Project verification v3 拒绝 v2字段、越界 discovery 与错误 scope', () => {
  const value = declaration({ mode: 'authoritative' });
  value.capabilities[0].applicability = { paths: ['**'] };
  value.capabilities[0].invocation.full.cwd = '../outside';
  value.capabilities[0].discovery.sources = ['../outside'];
  value.capabilities[0].scope.services = ['unknown'];
  const errors = validateProjectVerification(value, { projectCode: 'demo', services: ['known'] });
  assert.ok(errors.some((message) => message.includes('verification.mode')));
  assert.ok(errors.some((message) => message.includes('.applicability')));
  assert.ok(errors.some((message) => message.includes('invocation.full.cwd')));
  assert.ok(errors.some((message) => message.includes('discovery.sources')));
  assert.ok(errors.some((message) => message.includes('unknown Service unknown')));
});

test('Project verification capability preparation只接受同Project已登记Recipe scope', () => {
  const recipe = { id: 'web.npm-ci', scope: { kind: 'service', service: 'web' } };
  const value = declaration({
    capabilities: [capability({
      environment: {
        requires: ['node'],
        preparation: [{ project: 'demo', service: 'web', recipe: 'web.npm-ci' }],
      },
    })],
  });
  assert.deepEqual(validateProjectVerification(value, { projectCode: 'demo', services: ['web'], preparationRecipes: [[recipe.id, recipe]] }), []);
  value.capabilities[0].environment.preparation[0].project = 'other';
  value.capabilities[0].environment.preparation[0].service = 'unknown';
  value.capabilities[0].environment.preparation[0].recipe = 'missing';
  const errors = validateProjectVerification(value, { projectCode: 'demo', services: ['web'], preparationRecipes: [[recipe.id, recipe]] });
  assert.ok(errors.some((message) => message.includes('project must equal demo')));
  assert.ok(errors.some((message) => message.includes('unknown Service unknown')));
  assert.ok(errors.some((message) => message.includes('unknown Preparation Recipe missing')));
});

test('Project verification v3 只保留真实 claim 的 coordinated/external 资源', () => {
  const value = declaration({
    resources: [
      { id: 'browser', strategy: 'coordinated', capacity: 1, authorization: 'implicit' },
      { id: 'staging', strategy: 'external', authorization: 'explicit' },
    ],
    capabilities: [
      capability({ resourceClaims: ['browser'] }),
      capability({
        id: 'demo.staging',
        resourceClaims: ['staging'],
        effects: { writes: [], externalSystems: ['staging'], authorization: 'explicit' },
      }),
    ],
  });
  assert.deepEqual(validateProjectVerification(value, { projectCode: 'demo', services: [] }), []);
  value.resources[0].capacity = 0;
  value.resources[1].authorization = 'implicit';
  value.capabilities[0].resourceClaims.push('missing');
  const errors = validateProjectVerification(value, { projectCode: 'demo', services: [] });
  assert.ok(errors.some((message) => message.includes('capacity must be a positive integer')));
  assert.ok(errors.some((message) => message.includes('authorization must be explicit')));
  assert.ok(errors.some((message) => message.includes('unknown resource missing')));

  const unused = declaration({ resources: [{ id: 'browser', strategy: 'coordinated', capacity: 1, authorization: 'implicit' }] });
  assert.ok(validateProjectVerification(unused, { projectCode: 'demo', services: [] }).some((message) => message.includes('unclaimed resource browser')));
});

test('Project doctor 对声明缺失零 finding，对 v3 静默通过并对有效 v2 给出非阻塞迁移提示', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-project-verification-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.mkdirSync(projectRoot, { recursive: true });
  const findings = [];
  const diagnostics = createProjectVerificationDiagnostics({
    addDoctorFinding: (result, status, code, message, details) => result.findings.push({ status, code, message, ...details }),
    projectEnvironmentPreparation,
  });
  const registry = { projects: { demo: { source: { path: 'projects/demo' } } } };

  const absent = { findings: [] };
  diagnostics.diagnoseProjectVerification(absent, root, registry);
  assert.deepEqual(absent.projectVerification, []);
  assert.deepEqual(absent.findings, []);

  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify(declaration()));
  const valid = { findings: [] };
  diagnostics.diagnoseProjectVerification(valid, root, registry);
  assert.deepEqual(valid.projectVerification, [{ project: 'demo', path: 'projects/demo/verification.yml', valid: true, capabilityCount: 1 }]);
  assert.deepEqual(valid.findings, []);

  const legacy = legacyDeclaration();
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify(legacy));
  const legacyResult = { findings: [] };
  diagnostics.diagnoseProjectVerification(legacyResult, root, registry);
  assert.equal(legacyResult.projectVerification[0].valid, true);
  assert.ok(legacyResult.findings.some((finding) => finding.code === 'project.verification_v2_transition' && finding.status === 'info' && finding.userActionRequired === false));

  legacy.capabilities[0].affected = { kind: 'command', argv: ['npm', 'test'] };
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify(legacy));
  const malformedLegacy = { findings: [] };
  diagnostics.diagnoseProjectVerification(malformedLegacy, root, registry);
  assert.equal(malformedLegacy.projectVerification[0].valid, false);
  assert.ok(malformedLegacy.findings.some((finding) => finding.code === 'project.verification_invalid' && finding.status === 'error'));

  const invalidDeclaration = declaration();
  invalidDeclaration.capabilities[0].invocation.full.argv = [];
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify(invalidDeclaration));
  const invalid = { findings };
  diagnostics.diagnoseProjectVerification(invalid, root, registry);
  assert.ok(findings.some((finding) => finding.code === 'project.verification_invalid' && finding.status === 'error'));
  assert.equal(fs.readFileSync(path.join(projectRoot, 'verification.yml'), 'utf8'), YAML.stringify(invalidDeclaration));
});
