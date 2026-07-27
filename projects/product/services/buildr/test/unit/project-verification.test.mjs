import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import {
  createProjectVerificationDiagnostics,
  parseProjectVerification,
  validateProjectVerification,
} from '../../src/application/doctor/project-verification-diagnostics.mjs';

function validDeclaration(overrides = {}) {
  return {
    schemaVersion: 'buildr.project-verification/v1',
    mode: 'augment',
    resources: [
      { id: 'temp', title: 'Task temp', strategy: 'isolated', cleanup: 'provider-owned', authorization: 'implicit' },
      { id: 'data', title: 'Test data', strategy: 'namespaced', namespaceEnv: 'TEST_NAMESPACE', cleanup: 'task-owned', authorization: 'implicit' },
      { id: 'browser', title: 'Browser', strategy: 'coordinated', capacity: 1, cleanup: 'provider-owned', authorization: 'implicit' },
      { id: 'staging', title: 'Staging', strategy: 'external', cleanup: 'external', authorization: 'explicit' },
    ],
    capabilities: [{
      id: 'demo.unit',
      title: 'Demo unit tests',
      command: { argv: ['npm', 'test'], cwd: '.' },
      maturity: 'stable',
      stages: ['minimal', 'affected', 'candidate'],
      enforcement: { minimal: 'advisory', affected: 'required', candidate: 'required' },
      applicability: { paths: ['services/demo/**'], risks: [] },
      coverage: { kind: 'unit', owns: ['domain-logic'] },
      environment: { requires: ['node'], services: [] },
      effects: { level: 'local-temporary', writes: ['services/demo/coverage/**'], externalSystems: false },
      authorization: 'implicit',
      resourceClaims: ['temp', 'browser'],
      dependsOn: [],
      supersedes: [],
      sources: ['services/demo/package.json'],
    }],
    ...overrides,
  };
}

test('Project verification v1 接受任意稳定能力集合', () => {
  const declaration = validDeclaration();
  assert.deepEqual(validateProjectVerification(declaration), []);
  assert.deepEqual(parseProjectVerification(YAML.stringify(declaration)), declaration);

  const authoritative = validDeclaration({ mode: 'authoritative' });
  assert.deepEqual(validateProjectVerification(authoritative), []);
});

test('Project verification v1 拒绝未知字段、越界路径和未成熟门禁', () => {
  const declaration = validDeclaration();
  declaration.unknown = true;
  declaration.capabilities[0].command.cwd = '../outside';
  declaration.capabilities[0].maturity = 'trial';
  const errors = validateProjectVerification(declaration);
  assert.ok(errors.some((message) => message.includes('verification.unknown')));
  assert.ok(errors.some((message) => message.includes('command.cwd')));
  assert.ok(errors.some((message) => message.includes('cannot be required unless maturity is stable')));
});

test('Project verification v1 拒绝未知引用、依赖环和高副作用 implicit 授权', () => {
  const declaration = validDeclaration();
  declaration.capabilities[0].dependsOn = ['demo.service'];
  declaration.capabilities[0].effects = { level: 'shared', writes: [], externalSystems: true };
  declaration.capabilities.push({
    ...structuredClone(declaration.capabilities[0]),
    id: 'demo.service',
    title: 'Demo service tests',
    dependsOn: ['demo.unit'],
    supersedes: ['missing.capability'],
    authorization: 'explicit',
  });
  const errors = validateProjectVerification(declaration);
  assert.ok(errors.some((message) => message.includes('contains a cycle')));
  assert.ok(errors.some((message) => message.includes('references unknown capability missing.capability')));
  assert.ok(errors.some((message) => message.includes('authorization cannot be implicit')));
});

test('Project verification v1 校验资源策略、引用与授权闭包', () => {
  const declaration = validDeclaration();
  declaration.resources[1].namespaceEnv = 'invalid-name';
  declaration.resources[2].capacity = 0;
  declaration.resources[3].authorization = 'implicit';
  declaration.capabilities[0].resourceClaims.push('missing');
  const errors = validateProjectVerification(declaration);
  assert.ok(errors.some((message) => message.includes('namespaceEnv')));
  assert.ok(errors.some((message) => message.includes('capacity must be a positive integer')));
  assert.ok(errors.some((message) => message.includes('authorization must be explicit')));
  assert.ok(errors.some((message) => message.includes('references unknown resource missing')));
});

test('authoritative 模式要求稳定 Candidate required gate', () => {
  const declaration = validDeclaration({ mode: 'authoritative' });
  declaration.capabilities[0].stages = ['affected'];
  declaration.capabilities[0].enforcement = { affected: 'required' };
  assert.ok(validateProjectVerification(declaration).some((message) => message.includes('requires at least one stable required candidate capability')));
});

test('Project doctor 对声明缺失零 finding，对存在声明只读校验', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-project-verification-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.mkdirSync(projectRoot, { recursive: true });
  const findings = [];
  const diagnostics = createProjectVerificationDiagnostics({
    addDoctorFinding: (result, status, code, message, details) => result.findings.push({ status, code, message, ...details }),
  });
  const registry = { projects: { demo: { path: 'projects/demo' } } };

  const absent = { findings: [] };
  diagnostics.diagnoseProjectVerification(absent, root, registry);
  assert.deepEqual(absent.projectVerification, []);
  assert.deepEqual(absent.findings, []);

  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify(validDeclaration()));
  const valid = { findings: [] };
  diagnostics.diagnoseProjectVerification(valid, root, registry);
  assert.deepEqual(valid.projectVerification, [{ project: 'demo', path: 'projects/demo/verification.yml', valid: true, mode: 'augment', capabilityCount: 1 }]);
  assert.deepEqual(valid.findings, []);

  const invalidDeclaration = validDeclaration();
  invalidDeclaration.capabilities[0].command.argv = [];
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify(invalidDeclaration));
  const invalid = { findings };
  diagnostics.diagnoseProjectVerification(invalid, root, registry);
  assert.ok(findings.some((finding) => finding.code === 'project.verification_invalid' && finding.status === 'error'));
  assert.equal(fs.readFileSync(path.join(projectRoot, 'verification.yml'), 'utf8'), YAML.stringify(invalidDeclaration));
});
