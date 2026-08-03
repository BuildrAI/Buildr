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

function capability(overrides = {}) {
  return {
    id: 'demo.unit',
    title: 'Demo unit tests',
    scope: { project: 'demo', services: [] },
    invocation: { kind: 'command', argv: ['npm', 'test'], cwd: '.' },
    applicability: { paths: ['services/demo/**'], conditions: ['Demo implementation changed'] },
    proves: ['Demo domain behavior'],
    requiredForDelivery: true,
    environment: { requires: ['node'] },
    effects: { writes: ['coverage'], externalSystems: [], authorization: 'implicit' },
    resourceClaims: [],
    ...overrides,
  };
}

function declaration(overrides = {}) {
  return {
    schemaVersion: 'buildr.project-verification/v2',
    resources: [],
    capabilities: [capability()],
    ...overrides,
  };
}

test('Project verification v2 接受最小 command 与 bounded Agent 能力', () => {
  const value = declaration();
  delete value.resources;
  delete value.capabilities[0].title;
  delete value.capabilities[0].applicability.conditions;
  delete value.capabilities[0].environment;
  delete value.capabilities[0].effects;
  delete value.capabilities[0].resourceClaims;
  value.capabilities.push(capability({
    id: 'demo.acceptance',
    invocation: { kind: 'agent', instructions: ['Inspect the existing bounded acceptance workflow', 'Return observed facts only'] },
    requiredForDelivery: false,
  }));
  assert.deepEqual(validateProjectVerification(value, { projectCode: 'demo', services: [] }), []);
  assert.deepEqual(parseProjectVerification(YAML.stringify(value)), value);
});

test('Project verification v2 拒绝 v1 lifecycle 字段、越界路径与错误 scope', () => {
  const value = declaration({ mode: 'authoritative' });
  value.capabilities[0].maturity = 'stable';
  value.capabilities[0].invocation.cwd = '../outside';
  value.capabilities[0].scope.services = ['unknown'];
  const errors = validateProjectVerification(value, { projectCode: 'demo', services: ['known'] });
  assert.ok(errors.some((message) => message.includes('verification.mode')));
  assert.ok(errors.some((message) => message.includes('.maturity')));
  assert.ok(errors.some((message) => message.includes('invocation.cwd')));
  assert.ok(errors.some((message) => message.includes('unknown Service unknown')));
});

test('Project verification v2 只保留真实 claim 的 coordinated/external 资源', () => {
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

test('Project doctor 对声明缺失零 finding，对 v2 声明只读校验', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-project-verification-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.mkdirSync(projectRoot, { recursive: true });
  const findings = [];
  const diagnostics = createProjectVerificationDiagnostics({
    addDoctorFinding: (result, status, code, message, details) => result.findings.push({ status, code, message, ...details }),
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

  const invalidDeclaration = declaration();
  invalidDeclaration.capabilities[0].invocation.argv = [];
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify(invalidDeclaration));
  const invalid = { findings };
  diagnostics.diagnoseProjectVerification(invalid, root, registry);
  assert.ok(findings.some((finding) => finding.code === 'project.verification_invalid' && finding.status === 'error'));
  assert.equal(fs.readFileSync(path.join(projectRoot, 'verification.yml'), 'utf8'), YAML.stringify(invalidDeclaration));
});
