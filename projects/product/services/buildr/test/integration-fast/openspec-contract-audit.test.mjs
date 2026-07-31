import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const audit = path.resolve(import.meta.dirname, '../verification/openspec/contract-audit.mjs');

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function normalizedIntegrity(content) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');
  return `sha256-${crypto.createHash('sha256').update(normalized).digest('hex')}`;
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-candidate-audit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot = path.join(root, 'projects', 'product');
  const spec = path.join(productRoot, 'openspec', 'specs', 'demo', 'spec.md');
  write(spec, '# demo Specification\n\n## Purpose\n\nBaseline purpose.\n\n## Requirements\n\n### Requirement: Existing\nSystem MUST preserve the baseline.\n');
  git(root, ['init', '--initial-branch=dev']);
  git(root, ['config', 'user.email', 'buildr-test@example.com']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'baseline']);
  return { root, productRoot, spec, base: git(root, ['rev-parse', 'HEAD']) };
}

function runAudit(value) {
  return spawnSync(process.execPath, [audit], {
    cwd: value.productRoot,
    encoding: 'utf8',
    env: { ...process.env, BUILDR_PROJECT_ROOT: value.productRoot, BUILDR_VERIFICATION_BASE: value.base },
  });
}

test('候选审计拒绝只有已提交记录中可见且没有收敛回执的canonical变更', (t) => {
  const value = fixture(t);
  fs.appendFileSync(value.spec, '\n### Requirement: Candidate\nSystem MUST audit committed candidate changes.\n');
  git(value.root, ['add', '.']);
  git(value.root, ['commit', '-m', 'candidate canonical drift']);
  const result = runAudit(value);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /canonical spec changes without a matching receipt/);
});

test('候选审计允许相对基线仅维护Purpose正文', (t) => {
  const value = fixture(t);
  fs.writeFileSync(value.spec, fs.readFileSync(value.spec, 'utf8').replace('Baseline purpose.', 'Updated purpose.'));
  git(value.root, ['add', '.']);
  git(value.root, ['commit', '-m', 'maintain purpose']);
  const result = runAudit(value);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no canonical requirement changes/);
});

test('候选审计接受与当前canonical digest匹配的v3收敛回执', (t) => {
  const value = fixture(t);
  fs.appendFileSync(value.spec, '\n### Requirement: Candidate\nSystem MUST bind the convergence receipt.\n');
  const archived = path.join(value.productRoot, 'openspec', 'changes', 'archive', '2026-07-27-candidate-change');
  write(path.join(archived, 'specs', 'demo', 'spec.md'), '## ADDED Requirements\n\n### Requirement: Candidate\nSystem MUST bind the convergence receipt.\n');
  write(path.join(archived, '.buildr', 'convergence-receipt.json'), `${JSON.stringify({
    schemaVersion: 'buildr.openspec-convergence-receipt/v3',
    change: 'candidate-change',
    project: 'product',
    disposition: 'archived',
    files: [{ path: 'openspec/specs/demo/spec.md', expectedDigest: normalizedIntegrity(fs.readFileSync(value.spec, 'utf8')) }],
  }, null, 2)}\n`);
  git(value.root, ['add', '.']);
  git(value.root, ['commit', '-m', 'converged candidate']);
  const result = runAudit(value);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /demo associated with current candidate receipts/);
});
