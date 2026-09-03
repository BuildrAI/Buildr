import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const audit: any = path.resolve(import.meta.dirname, '../verification/openspec/contract-audit.ts');

function git(root: any, args: any): any  {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(file: any, content: any): any  {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fixture(t: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-candidate-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot: any = path.join(root, 'projects', 'product');
  const spec: any = path.join(productRoot, 'openspec', 'specs', 'demo', 'spec.md');
  write(spec, '# demo Specification\n\n## Purpose\n\nBaseline purpose.\n\n## Requirements\n\n### Requirement: Existing\nSystem MUST preserve the baseline.\n');
  git(root, ['init', '--initial-branch=dev']);
  git(root, ['config', 'user.email', 'buildr-test@example.com']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'baseline']);
  return { root, productRoot, spec, base: git(root, ['rev-parse', 'HEAD']) };
}

function runAudit(value: any): any  {
  return spawnSync(process.execPath, [audit], {
    cwd: value.productRoot,
    encoding: 'utf8',
    env: { ...process.env, BUILDR_PROJECT_ROOT: value.productRoot, BUILDR_VERIFICATION_BASE: value.base },
  });
}

test('候选审计拒绝没有Archived Change delta的canonical变更', (t: any) => {
  const value: any = fixture(t);
  fs.appendFileSync(value.spec, '\n### Requirement: Candidate\nSystem MUST audit committed candidate changes.\n');
  git(value.root, ['add', '.']);
  git(value.root, ['commit', '-m', 'candidate canonical drift']);
  const result: any = runAudit(value);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /without a matching Archived Change delta/);
});

test('候选审计允许相对基线仅维护Purpose正文', (t: any) => {
  const value: any = fixture(t);
  fs.writeFileSync(value.spec, fs.readFileSync(value.spec, 'utf8').replace('Baseline purpose.', 'Updated purpose.'));
  git(value.root, ['add', '.']);
  git(value.root, ['commit', '-m', 'maintain purpose']);
  const result: any = runAudit(value);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no canonical requirement changes/);
});

test('候选审计接受无需tracked Receipt且可重放到当前canonical的Archived Change delta', (t: any) => {
  const value: any = fixture(t);
  fs.appendFileSync(value.spec, '\n### Requirement: Candidate\nSystem MUST bind the convergence receipt.\n');
  const archived: any = path.join(value.productRoot, 'openspec', 'changes', 'archive', '2026-07-27-candidate-change');
  write(path.join(archived, 'specs', 'demo', 'spec.md'), '## ADDED Requirements\n\n### Requirement: Candidate\nSystem MUST bind the convergence receipt.\n');
  git(value.root, ['add', '.']);
  git(value.root, ['commit', '-m', 'converged candidate']);
  const result: any = runAudit(value);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /demo associated with current candidate Archived Change deltas/);
  assert.equal(fs.existsSync(path.join(archived, '.buildr', 'convergence-receipt.json')), false);
});

test('候选审计可重放先新增后移除且最终不存在的历史 capability', (t: any) => {
  const value: any = fixture(t);
  fs.appendFileSync(value.spec, '\n### Requirement: Candidate\nSystem MUST bind the retained canonical change.\n');
  const first: any = path.join(value.productRoot, 'openspec', 'changes', 'archive', '2026-07-27-candidate-change');
  write(path.join(first, 'specs', 'demo', 'spec.md'), '## ADDED Requirements\n\n### Requirement: Candidate\nSystem MUST bind the retained canonical change.\n');
  write(path.join(first, 'specs', 'ephemeral', 'spec.md'), '## ADDED Requirements\n\n### Requirement: Temporary\nSystem MUST expose a temporary capability.\n');
  const second: any = path.join(value.productRoot, 'openspec', 'changes', 'archive', '2026-07-28-remove-ephemeral');
  write(path.join(second, 'specs', 'ephemeral', 'spec.md'), '## REMOVED Requirements\n\n### Requirement: Temporary\n**Reason**: The temporary capability is no longer current.\n\n**Migration**: Remove it.\n\n#### Scenario: Remove temporary capability\n- **WHEN** the later Change converges\n- **THEN** the capability MUST be absent\n');
  git(value.root, ['add', '.']);
  git(value.root, ['commit', '-m', 'converged add then remove capability']);
  const result: any = runAudit(value);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /demo associated with current candidate Archived Change deltas/);
});

test('候选审计拒绝Archived Change delta与当前canonical不匹配', (t: any) => {
  const value: any = fixture(t);
  fs.appendFileSync(value.spec, '\n### Requirement: Candidate\nSystem MUST preserve a different result.\n');
  const archived: any = path.join(value.productRoot, 'openspec', 'changes', 'archive', '2026-07-27-candidate-change');
  write(path.join(archived, 'specs', 'demo', 'spec.md'), '## ADDED Requirements\n\n### Requirement: Candidate\nSystem MUST bind the archived delta.\n');
  git(value.root, ['add', '.']);
  git(value.root, ['commit', '-m', 'mismatched converged candidate']);
  const result: any = runAudit(value);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /delta\/canonical mismatch/);
});
