#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const buildr: any = path.join(productRoot, 'bin', 'buildr.mjs');
const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-service-branch-'));
const remote: any = path.join(root, 'api.git');
const seed: any = path.join(root, 'seed');
const workspace: any = path.join(root, 'workspace');

function run(command: any, args: any, options: any = {}): any  {
  const result: any = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  });
  if ((options.expected ?? 0) !== result.status) {
    throw new Error(`${command} ${args.join(' ')} returned ${result.status}:\n${result.stderr || result.stdout || result.error?.message}`);
  }
  return result;
}

try {
  run('git', ['init', '--bare', remote]);
  run('git', ['init', '-b', 'main', seed]);
  run('git', ['config', 'user.email', 'buildr@example.com'], { cwd: seed });
  run('git', ['config', 'user.name', 'Buildr'], { cwd: seed });
  fs.writeFileSync(path.join(seed, 'README.md'), '# main\n');
  run('git', ['add', 'README.md'], { cwd: seed });
  run('git', ['commit', '-m', 'main'], { cwd: seed });
  run('git', ['remote', 'add', 'origin', remote], { cwd: seed });
  run('git', ['push', '-u', 'origin', 'main'], { cwd: seed });
  run('git', ['checkout', '-b', 'feature'], { cwd: seed });
  fs.writeFileSync(path.join(seed, 'FEATURE.md'), '# feature\n');
  run('git', ['add', 'FEATURE.md'], { cwd: seed });
  run('git', ['commit', '-m', 'feature'], { cwd: seed });
  run('git', ['push', '-u', 'origin', 'feature'], { cwd: seed });
  run('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: remote });

  fs.mkdirSync(workspace);
  run(process.execPath, [buildr, 'init', '--target', workspace, '--name', 'service-branch', '--profile', 'team']);
  run(process.execPath, [buildr, 'service', 'create', 'demo/api', remote, '--branch', 'feature', '--target', workspace, '--type', 'backend']);
  const serviceRoot: any = path.join(workspace, 'projects', 'demo', 'services', 'api');
  assert.equal(run('git', ['branch', '--show-current'], { cwd: serviceRoot }).stdout.trim(), 'feature');
  assert.equal(fs.existsSync(path.join(serviceRoot, 'FEATURE.md')), true);
  const manifest: any = YAML.parse(fs.readFileSync(path.join(workspace, 'projects', 'demo', 'services', 'manifest.yml'), 'utf8'));
  assert.equal(manifest.schemaVersion, 'buildr.services/v2');
  assert.equal(manifest.services.api.source.git.integrationBranch, 'feature');

  run(process.execPath, [buildr, 'service', 'create', 'demo/api', remote, '--target', workspace, '--type', 'backend']);
  const conflicting: any = run(process.execPath, [buildr, 'service', 'create', 'demo/api', remote, '--branch', 'main', '--target', workspace], { expected: 1 });
  assert.match(conflicting.stderr, /integration branch conflicts/);

  run('git', ['fetch', 'origin', 'main:refs/remotes/origin/main'], { cwd: serviceRoot });
  run('git', ['checkout', '-b', 'main', 'origin/main'], { cwd: serviceRoot });
  const doctor: any = JSON.parse(run(process.execPath, [buildr, 'doctor', '--target', workspace, '--scope', 'projects/demo', '--json']).stdout);
  const finding: any = doctor.findings.find((item: any) => item.code === 'service.branch_mismatch');
  assert(finding);
  assert.equal(finding.expected, 'feature');
  assert.equal(finding.actual, 'main');

  const localSource: any = path.join(root, 'local');
  run('git', ['init', localSource]);
  const localBranch: any = run(process.execPath, [buildr, 'service', 'create', 'demo/local', localSource, '--branch', 'feature', '--target', workspace], { expected: 1 });
  assert.match(localBranch.stderr, /only supported for Git Service sources/);
  console.log('Service branch verification passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
