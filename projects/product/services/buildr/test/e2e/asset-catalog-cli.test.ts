import { createServiceDiagnostics } from '../../src/modules/workspace/application/diagnostics/service-diagnostics.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { resolveRuleScope } from '../../src/modules/agent-assets/infrastructure/runtime/rule-projection.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { copyPreparedProjectWorkspace, copyPreparedLegacyProjectWorkspace } from '../helpers/prepared-fixtures.ts';
import { createWorkspaceHttpContribution } from '../../src/modules/workspace/interfaces/http/workspace-http.ts';
import { setup, setupLegacy, ready, addRepo, waitFor, makeOriginRepository, initRepository } from '../helpers/asset-relationships.ts';



test('public asset CLI reads and writes the same catalog with version protection', (t: any) => {
  const { root, runtime } = setup(t);
  const cli = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
  const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, 'assets', ...args, '--target', root, '--json'], { encoding: 'utf8' });
  const observed = invoke('inspect'); assert.equal(observed.status, 0, observed.stderr);
  const before = JSON.parse(observed.stdout);
  const input = path.join(root, 'migration-input.json'); fs.writeFileSync(input, JSON.stringify({ revision: before.revision }));
  const migrated = invoke('migrate', '--input', input); assert.equal(migrated.status, 0, migrated.stderr);
  fs.writeFileSync(input, JSON.stringify({ revision: JSON.parse(migrated.stdout).revision, code: 'cli-code', url: 'https://example.com/cli.git', integrationBranch: 'dev' }));
  const created = invoke('create', 'repository', '--input', input); assert.equal(created.status, 0, created.stderr);
  assert.equal(runtime.assetCatalog(root).repositories[0].code, 'cli-code');
  assert.notEqual(invoke('create', 'repository', '--input', input).status, 0);
  const directory = path.join(root, 'projects/cli-existing'); fs.mkdirSync(directory);
  const candidates = invoke('project-candidates'); assert.equal(candidates.status, 0, candidates.stderr);
  const available = JSON.parse(candidates.stdout), candidate = available.candidates.find((item: any) => item.code === 'cli-existing');
  fs.writeFileSync(input, JSON.stringify({ revision: available.revision, code: candidate.code, name: 'CLI existing', observation: candidate.observation }));
  const registered = invoke('register', 'project', '--input', input); assert.equal(registered.status, 0, registered.stderr);
  assert.equal(runtime.assetCatalog(root).projects.some((project: any) => project.code === candidate.code), true);
  assert.deepEqual(fs.readdirSync(directory), []);
});


test('assets help examples execute through the public CLI and retired guide stays unavailable', async (t: any) => {
  const { root, runtime } = setup(t);
  let catalog = ready(runtime, root);
  const cli = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
  const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, BUILDR_APP_DATA_DIR: path.join(root, '.isolated-app'), BUILDR_PRODUCT_DATA_DIR: path.join(root, '.isolated-product') },
  });
  const help = invoke('help', 'assets');
  assert.equal(help.status, 0, help.stderr);
  assert.equal(invoke('assets', '--help').stdout, help.stdout);
  const examples = help.stdout.split('\n').filter(line => line.trim().startsWith('{')).map(line => JSON.parse(line));
  assert.equal(examples.length, 3);
  const inputFile = path.join(root, 'help-input.json');
  const write = (args: string[], input: any) => {
    fs.writeFileSync(inputFile, JSON.stringify(input));
    const result = invoke('assets', ...args, '--target', root, '--input', inputFile, '--json');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };
  // The prepared workspace already owns demo; replace only the example identity.
  catalog = write(['create', 'project'], { ...examples[0], code: 'help-project', revision: catalog.revision });
  assert.equal(catalog.projects.find((p: any) => p.code === 'help-project').description, '项目目标');
  catalog = addRepo(runtime, root, catalog.revision, 'help-code', 'main');
  const repositoryId = catalog.repositories.find((r: any) => r.code === 'help-code').id;
  catalog = write(['create', 'service'], { ...examples[1], revision: catalog.revision, service: { ...examples[1].service, repositoryId } });
  const serviceId = catalog.services.find((service: any) => service.code === 'api').id;
  catalog = write(['associate', 'help-project'], { ...examples[2], revision: catalog.revision, serviceIds: [serviceId] });
  assert.deepEqual(catalog.projects.find((p: any) => p.code === 'help-project').serviceIds, [serviceId]);
  await waitFor(() => runtime.repositoryCloneStatus(root, repositoryId).state !== 'cloning', 'repository clone must finish');
  const cloned = runtime.repositoryCloneStatus(root, repositoryId);
  assert.equal(cloned.state, 'failed', `unreachable git url must surface a failed clone state, got ${JSON.stringify(cloned)}`);
  assert.equal(runtime.assetCatalog(root).repositories.find((repository: any) => repository.id === repositoryId).available, false, 'failed clone cannot become ready merely because a partial directory exists');
  const before = ['projects/manifest.yml', 'services/manifest.yml', 'repositories/manifest.yml'].map(file => fs.readFileSync(path.join(root, file)));
  const directoryBefore = fs.readdirSync(root);
  for (const args of [['bootstrap', 'guide'], ['bootstrap', 'guide', '--help'], ['help', 'bootstrap', 'guide']]) {
    const result = invoke(...args, '--json');
    assert.equal(result.status, 2);
    const diagnostic = JSON.parse(result.stdout);
    assert.match(diagnostic.error.code, /^cli\.unknown_(?:command|help_topic)$/);
    assert.ok(!diagnostic.suggestions.some((suggestion: string) => suggestion.includes('bootstrap')));
  }
  assert.deepEqual(fs.readdirSync(root), directoryBefore);
  ['projects/manifest.yml', 'services/manifest.yml', 'repositories/manifest.yml'].forEach((file, index) => assert.deepEqual(fs.readFileSync(path.join(root, file)), before[index]));
});
