#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const buildr: any = path.join(productRoot, 'bin', 'buildr.mjs');
const fixtureRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-managed-integrity-'));
const workspace: any = path.join(fixtureRoot, 'workspace');

function run(args: any, options: any = {}): any  {
  const result: any = spawnSync(process.execPath, [buildr, ...args], {
    cwd: productRoot,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
  if (options.expectFailure ? result.status === 0 : result.status !== 0) {
    throw new Error(`Unexpected command result (${result.status}): buildr ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function git(args: any, cwd: any = fixtureRoot): any  {
  const result: any = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function initializeGitBaseline(root: any): any  {
  git(['init'], root);
  git(['config', 'user.name', 'Buildr Verification'], root);
  git(['config', 'user.email', 'buildr-verification@example.com'], root);
  git(['add', '-A'], root);
  git(['commit', '-m', 'fixture baseline'], root);
}

function assertNoMutationTransaction(root: any, label: any): any  {
  const stateRoot: any = path.join(root, '.buildr', 'mutations');
  const entries: any = fs.existsSync(stateRoot) ? fs.readdirSync(stateRoot, { withFileTypes: true }) : [];
  if (entries.some((entry: any) => entry.isDirectory()) || fs.existsSync(path.join(stateRoot, 'lock.json'))) {
    throw new Error(`${label} created a mutation transaction or lock.`);
  }
}

function verifyOptionalBuiltinPreflight(mode: any): any  {
  const root: any = path.join(fixtureRoot, `optional-${mode}`);
  run(['init', '--target', root, '--name', `optional-${mode}`]);
  const skillRoot: any = path.join(root, 'skills', 'buildr', 'task-retrospective');
  const skillFile: any = path.join(skillRoot, 'SKILL.md');
  if (mode === 'modified') fs.appendFileSync(skillFile, '\nuser modification\n');
  else fs.rmSync(skillRoot, { recursive: true, force: true });
  initializeGitBaseline(root);
  const beforeContent: any = mode === 'modified' ? fs.readFileSync(skillFile, 'utf8') : null;
  const result: any = run(['sync', 'codex', '--target', root]);
  const output: any = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(`skill:task-retrospective`) || !output.includes(`保持原样`) || !output.includes(mode)) throw new Error(`Optional Builtin ${mode} did not report the preserved ownership unit.`);
  assertNoMutationTransaction(root, `Optional Builtin ${mode}`);
  if (mode === 'modified' && fs.readFileSync(skillFile, 'utf8') !== beforeContent) throw new Error('Modified optional Builtin content changed during preflight.');
  if (mode === 'missing' && fs.existsSync(skillRoot)) throw new Error('Missing optional Builtin was restored before user decision.');
}

function verifyComponentConflictPreflight(): any  {
  const root: any = path.join(fixtureRoot, 'component-conflict');
  run(['init', '--target', root, '--name', 'component-conflict']);
  fs.rmSync(path.join(root, 'components'), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'commands', 'buildr', 'openspec'), { recursive: true, force: true });
  const skillFile: any = path.join(root, 'skills', 'openspec', 'openspec-propose', 'SKILL.md');
  fs.appendFileSync(skillFile, '\nlegacy user edit\n');
  initializeGitBaseline(root);
  const beforeContent: any = fs.readFileSync(skillFile, 'utf8');
  const result: any = run(['sync', 'codex', '--target', root]);
  const output: any = `${result.stdout}\n${result.stderr}`;
  if (!output.includes('optional ownership unit component:openspec 保持原样') || !output.includes('Legacy Component migration')) throw new Error('Optional Component conflict did not report the preserved ownership unit.');
  assertNoMutationTransaction(root, 'Component conflict');
  if (fs.readFileSync(skillFile, 'utf8') !== beforeContent) throw new Error('Component conflict changed the user-edited member.');
}

try {
  verifyOptionalBuiltinPreflight('modified');
  verifyOptionalBuiltinPreflight('missing');
  verifyComponentConflictPreflight();
  run(['init', '--target', workspace, '--name', 'integrity-fixture']);

  for (const id of ['.', '..']) {
    const before: any = fs.readFileSync(path.join(workspace, 'projects', 'manifest.yml'), 'utf8');
    run(['project', 'create', id, '--target', workspace], { expectFailure: true });
    if (fs.readFileSync(path.join(workspace, 'projects', 'manifest.yml'), 'utf8') !== before) throw new Error(`Invalid Project id mutated registry: ${id}`);
  }

  const ruleFile: any = path.join(workspace, 'rules', 'fixture.md');
  fs.writeFileSync(ruleFile, '# Fixture\n');
  run(['rules', 'add', 'fixture', '--description', 'fixture rule', '--target', workspace]);
  run(['rules', 'remove', 'fixture', '--target', workspace]);
  if (fs.existsSync(ruleFile)) throw new Error('Normal Rule member deletion was blocked.');

  const escapedDescription: any = 'line one\nline "two"';
  run(['commands', 'add', 'fixture-tool', '--purpose', 'fixture', '--description', escapedDescription, '--install-hint', 'https://example.com/tool', '--target', workspace]);
  const commands: any = YAML.parse(fs.readFileSync(path.join(workspace, 'commands', 'manifest.yml'), 'utf8'));
  if (commands.commands.find((item: any) => item.id === 'fixture-tool')?.description !== escapedDescription) throw new Error('YAML escaped scalar did not round-trip.');

  const output: any = path.join(fixtureRoot, 'package-output');
  run(['package', 'build', '--out', output]);
  run(['package', 'build', '--out', output]);
  if (!fs.existsSync(path.join(output, '.buildr-package-output.json'))) throw new Error('Package output receipt is missing.');
  fs.appendFileSync(path.join(output, 'README.md'), '\nmodified\n');
  run(['package', 'build', '--out', output], { expectFailure: true });
  if (!fs.readFileSync(path.join(output, 'README.md'), 'utf8').includes('modified')) throw new Error('Modified package output was overwritten.');
  const unowned: any = path.join(fixtureRoot, 'unowned');
  fs.mkdirSync(unowned);
  fs.writeFileSync(path.join(unowned, 'keep.txt'), 'keep');
  run(['package', 'build', '--out', unowned], { expectFailure: true });
  if (fs.readFileSync(path.join(unowned, 'keep.txt'), 'utf8') !== 'keep') throw new Error('Unowned package output was modified.');
  run(['package', 'build', '--out', productRoot], { expectFailure: true });

  const projectRemoteA: any = path.join(fixtureRoot, 'project-a.git');
  const projectRemoteB: any = path.join(fixtureRoot, 'project-b.git');
  git(['init', '--bare', projectRemoteA]);
  git(['init', '--bare', projectRemoteB]);
  run(['project', 'create', 'git-project', '--repo', `file://${projectRemoteA}`, '--target', workspace]);
  run(['project', 'create', 'git-project', '--repo', `file://${projectRemoteA}`, '--target', workspace]);
  const projectRegistryBefore: any = fs.readFileSync(path.join(workspace, 'projects', 'manifest.yml'), 'utf8');
  run(['project', 'create', 'git-project', '--repo', `file://${projectRemoteB}`, '--target', workspace], { expectFailure: true });
  if (fs.readFileSync(path.join(workspace, 'projects', 'manifest.yml'), 'utf8') !== projectRegistryBefore) throw new Error('Project identity conflict mutated registry.');

  const serviceRemoteA: any = path.join(fixtureRoot, 'service-a.git');
  const serviceRemoteB: any = path.join(fixtureRoot, 'service-b.git');
  git(['init', '--bare', serviceRemoteA]);
  git(['init', '--bare', serviceRemoteB]);
  run(['service', 'create', 'git-project/api', `file://${serviceRemoteA}`, '--target', workspace]);
  run(['service', 'create', 'git-project/api', `file://${serviceRemoteA}`, '--target', workspace]);
  const serviceManifest: any = path.join(workspace, 'projects', 'git-project', 'services', 'manifest.yml');
  const serviceRegistryBefore: any = fs.readFileSync(serviceManifest, 'utf8');
  run(['service', 'create', 'git-project/api', `file://${serviceRemoteB}`, '--target', workspace], { expectFailure: true });
  if (fs.readFileSync(serviceManifest, 'utf8') !== serviceRegistryBefore) throw new Error('Service identity conflict mutated metadata.');

  const serviceRoot: any = path.join(workspace, 'projects', 'git-project', 'services', 'api');
  git(['config', 'user.name', 'Buildr Verification'], serviceRoot);
  git(['config', 'user.email', 'buildr-verification@example.com'], serviceRoot);
  fs.writeFileSync(path.join(serviceRoot, 'keep.txt'), 'keep\n');
  git(['add', 'keep.txt'], serviceRoot);
  git(['commit', '-m', 'service fixture'], serviceRoot);
  const serviceHead: any = git(['rev-parse', 'HEAD'], serviceRoot);
  const serviceStatus: any = git(['status', '--porcelain=v1', '--untracked-files=all'], serviceRoot);
  run(['sync', 'codex', '--target', workspace], { expectFailure: true, env: { BUILDR_FAULT_AFTER_MUTATION_WRITE: '1' } });
  if (!fs.existsSync(path.join(serviceRoot, 'keep.txt')) || fs.readFileSync(path.join(serviceRoot, 'keep.txt'), 'utf8') !== 'keep\n') throw new Error('Sync rollback changed nested Service repository content.');
  if (git(['rev-parse', 'HEAD'], serviceRoot) !== serviceHead || git(['status', '--porcelain=v1', '--untracked-files=all'], serviceRoot) !== serviceStatus) throw new Error('Sync rollback changed nested Service repository Git state.');
  assertNoMutationTransaction(workspace, 'Nested Service rollback');

  run(['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', workspace], { expectFailure: true, env: { BUILDR_FAULT_AFTER_MUTATION_WRITE: '1' } });
  run(['component', 'check', 'openspec', '--target', workspace, '--json']);
  if (!fs.existsSync(path.join(workspace, 'components', 'buildr', 'openspec', 'component.yml'))) throw new Error('Component rollback lost installed definition.');

  const coreFile: any = path.join(workspace, 'skills', 'buildr', 'git-operations', 'SKILL.md');
  const coreBeforeRestore: any = `${fs.readFileSync(coreFile, 'utf8')}\nuser restore fixture\n`;
  fs.writeFileSync(coreFile, coreBeforeRestore);
  const rollbackFailure: any = run(['builtin', 'restore', 'git-operations', '--target', workspace], { expectFailure: true, env: { BUILDR_FAULT_AFTER_MUTATION_WRITE: '1', BUILDR_FAULT_MUTATION_RESTORE_REMOVE: '1' } });
  if (!`${rollbackFailure.stdout}\n${rollbackFailure.stderr}`.includes('Rollback failed')) throw new Error('Injected restore removal failure did not preserve a rollback-failed transaction.');
  const failedTransaction: any = fs.readdirSync(path.join(workspace, '.buildr', 'mutations'), { withFileTypes: true }).find((entry: any) => entry.isDirectory());
  if (!failedTransaction) throw new Error('Rollback failure did not preserve its transaction directory.');
  run(['mutation', 'recover', failedTransaction.name, '--target', workspace]);
  if (fs.readFileSync(coreFile, 'utf8') !== coreBeforeRestore) throw new Error('Mutation recover did not restore the transaction pre-state.');
  const repeatedRecover: any = run(['mutation', 'recover', failedTransaction.name, '--target', workspace]);
  if (!repeatedRecover.stdout.includes('已经恢复')) throw new Error('Repeated mutation recover was not reported as a proven no-op.');
  run(['mutation', 'recover', 'unknown-transaction', '--target', workspace], { expectFailure: true });
  run(['builtin', 'restore', 'git-operations', '--target', workspace]);

  const transactionId: any = 'fixture-transaction';
  const transactionRoot: any = path.join(workspace, '.buildr', 'mutations', transactionId);
  fs.mkdirSync(path.join(transactionRoot, 'backup'), { recursive: true });
  const journal: any = { schemaVersion: 'buildr.mutation/v1', transactionId, operation: 'fixture', phase: 'rollback-failed', affectedPaths: [], snapshots: [] };
  fs.writeFileSync(path.join(transactionRoot, 'journal.json'), `${JSON.stringify(journal)}\n`);
  fs.writeFileSync(path.join(workspace, '.buildr', 'mutations', 'lock.json'), `${JSON.stringify(journal)}\n`);
  const doctor: any = run(['doctor', '--agent', 'codex', '--target', workspace, '--json'], { expectFailure: true });
  const doctorJson: any = JSON.parse(doctor.stdout);
  if (!doctorJson.findings.some((item: any) => item.code === 'mutation.transaction_incomplete')) throw new Error('Doctor did not report incomplete transaction.');
  run(['commands', 'remove', 'fixture-tool', '--target', workspace], { expectFailure: true });
  run(['mutation', 'recover', transactionId, '--target', workspace]);
  if (fs.existsSync(path.join(workspace, '.buildr', 'mutations', 'lock.json'))) throw new Error('Mutation recovery did not remove matching lock.');

  console.log('Managed data integrity verification passed.');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
