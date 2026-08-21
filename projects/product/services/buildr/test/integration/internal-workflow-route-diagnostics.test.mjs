import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createInternalWorkflowRouteDiagnostics } from '../../src/application/doctor/internal-workflow-route-diagnostics.mjs';
import { inspectRequiredInternalWorkflowRoutes } from '../../src/application/internal-workflow-route-inventory.mjs';

const SERVICE_ROOT = path.resolve(import.meta.dirname, '../..');
const CONSUMERS = [
  'resources/workspace/skills/buildr/task-development/SKILL.md',
  'resources/workspace/skills/buildr/task-retrospective/SKILL.md',
  'resources/workspace/skills/buildr/task-review/SKILL.md',
  'resources/workspace/skills/buildr/openspec-contract-guard/SKILL.md',
  'resources/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md',
  'resources/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md',
  'resources/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md',
];

function diagnostics(productRoot) {
  return createInternalWorkflowRouteDiagnostics({
    addDoctorFinding: (result, status, code, message, details = {}) => result.findings.push({ status, code, message, ...details }),
    fs,
    path,
    productRoot: () => productRoot,
    inspectRoutes: inspectRequiredInternalWorkflowRoutes,
  });
}

test('Doctor accepts the current required internal workflow route closure', () => {
  const result = { findings: [] };
  diagnostics(SERVICE_ROOT).diagnoseInternalWorkflowRoutes(result);
  assert.deepEqual(result.findings, []);
});

test('Doctor reports a managed consumer that drifts back to a source-only driver', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-route-doctor-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relative of CONSUMERS) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(SERVICE_ROOT, relative), target);
  }
  const retrospective = path.join(root, 'resources/workspace/skills/buildr/task-retrospective/SKILL.md');
  fs.writeFileSync(retrospective, fs.readFileSync(retrospective, 'utf8').replaceAll('__internal task-retrospective', 'src/task/interfaces/internal/task-retrospective-driver.mjs'));

  const result = { findings: [] };
  diagnostics(root).diagnoseInternalWorkflowRoutes(result);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].status, 'error');
  assert.equal(result.findings[0].code, 'product.internal_workflow_route_closure_invalid');
  assert.ok(result.findings[0].failures.some((failure) => failure.endsWith(':source-driver')));
});
