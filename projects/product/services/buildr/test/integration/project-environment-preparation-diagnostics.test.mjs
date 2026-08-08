import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { createProjectEnvironmentPreparationDiagnostics } from '../../src/application/doctor/project-environment-preparation-diagnostics.mjs';

function declaration(service = 'api') {
  return {
    schemaVersion: 'buildr.project-environment-preparation/v1',
    recipes: [{
      id: `${service}.deps`, scope: { kind: 'service', service }, required: true,
      steps: [{ id: 'prepare', cwd: '.', executable: { kind: 'workspace-foundation', name: 'npm' }, args: ['ci'], inputs: ['package.json', 'package-lock.json'], outputs: [{ path: 'node_modules', kind: 'directory' }], required: true, timeoutMs: 180_000 }],
    }],
  };
}

test('Project doctor只读校验Preparation Declaration，缺失不伪造声明', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-project-preparation-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.mkdirSync(path.join(projectRoot, 'services'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'services', 'manifest.yml'), 'schemaVersion: buildr.services/v2\nservices:\n  api:\n    code: api\n');
  const diagnostics = createProjectEnvironmentPreparationDiagnostics({
    addDoctorFinding: (result, status, code, message, details) => result.findings.push({ status, code, message, ...details }),
  });
  const registry = { projects: { demo: { source: { path: 'projects/demo' } } } };

  const absent = { findings: [] };
  diagnostics.diagnoseProjectEnvironmentPreparation(absent, root, registry);
  assert.deepEqual(absent.projectEnvironmentPreparation, []);
  assert.deepEqual(absent.findings, []);

  fs.writeFileSync(path.join(projectRoot, 'preparation.yml'), YAML.stringify(declaration()));
  const valid = { findings: [] };
  diagnostics.diagnoseProjectEnvironmentPreparation(valid, root, registry);
  assert.equal(valid.projectEnvironmentPreparation[0].valid, true);
  assert.equal(valid.projectEnvironmentPreparation[0].recipeCount, 1);
  assert.match(valid.projectEnvironmentPreparation[0].identity, /^sha256-/);
  assert.deepEqual(valid.findings, []);

  const original = YAML.stringify(declaration('missing'));
  fs.writeFileSync(path.join(projectRoot, 'preparation.yml'), original);
  const invalid = { findings: [] };
  diagnostics.diagnoseProjectEnvironmentPreparation(invalid, root, registry);
  assert.equal(invalid.projectEnvironmentPreparation[0].valid, false);
  assert.equal(invalid.findings[0].code, 'project.environment_preparation_invalid');
  assert.equal(fs.readFileSync(path.join(projectRoot, 'preparation.yml'), 'utf8'), original);
});
