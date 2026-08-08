import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeProjectEnvironmentPreparation,
  parseProjectEnvironmentPreparation,
  projectEnvironmentPreparationScopeSelector,
} from '../../src/domain/task-environment/project-environment-preparation.mjs';

const npmStep = {
  id: 'npm-ci', cwd: '.', executable: { kind: 'workspace-foundation', name: 'npm' }, args: ['ci'],
  inputs: ['package.json', 'package-lock.json'], outputs: [{ path: 'node_modules', kind: 'directory' }], required: true, timeoutMs: 300_000,
};

test('Project Preparation Declaration支持Project-only与多个Service Recipe，并形成稳定identity', () => {
  const input = {
    schemaVersion: 'buildr.project-environment-preparation/v1',
    recipes: [
      { id: 'project-bootstrap', scope: { kind: 'project' }, required: true, steps: [{ ...npmStep, executable: { kind: 'project', path: 'scripts/bootstrap' }, args: [], outputs: [{ path: '.cache/bootstrap', kind: 'directory' }] }] },
      { id: 'api-deps', scope: { kind: 'service', service: 'api' }, required: true, steps: [npmStep] },
      { id: 'web-deps', scope: { kind: 'service', service: 'web' }, required: true, steps: [npmStep] },
    ],
  };
  const first = normalizeProjectEnvironmentPreparation(input, { projectCode: 'demo', services: ['api', 'web'] });
  const second = normalizeProjectEnvironmentPreparation(parseProjectEnvironmentPreparation(JSON.stringify(input)), { projectCode: 'demo', services: ['api', 'web'] });
  assert.equal(first.identity, second.identity);
  assert.equal(new Set(first.recipes.map((recipe) => recipe.identity)).size, 3);
  assert.deepEqual(first.recipes.map((recipe) => projectEnvironmentPreparationScopeSelector('demo', recipe)), ['project:demo', 'service:demo/api', 'service:demo/web']);
});

test('Project Preparation Declaration拒绝未知Service、递归猜测字段和Service executable越权', () => {
  assert.throws(() => normalizeProjectEnvironmentPreparation({ schemaVersion: 'buildr.project-environment-preparation/v1', recipes: [{ id: 'unknown', scope: { kind: 'service', service: 'missing' }, required: true, steps: [npmStep] }] }, { projectCode: 'demo', services: ['api'] }), /未知Service/);
  assert.throws(() => normalizeProjectEnvironmentPreparation({ schemaVersion: 'buildr.project-environment-preparation/v1', discover: ['**/package-lock.json'], recipes: [] }, { projectCode: 'demo' }), /discover 不受支持/);
  assert.throws(() => normalizeProjectEnvironmentPreparation({ schemaVersion: 'buildr.project-environment-preparation/v1', recipes: [{ id: 'bad-project', scope: { kind: 'project' }, required: true, steps: [{ ...npmStep, executable: { kind: 'service', path: 'bin/tool' } }] }] }, { projectCode: 'demo' }), /Project Recipe不能使用service executable/);
});
