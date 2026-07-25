#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const buildr = path.join(productRoot, 'bin', 'buildr.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-contract-'));
const project = 'demo';
const projectRoot = path.join(root, 'projects', project);
const specsRoot = path.join(projectRoot, 'openspec', 'specs');
const changesRoot = path.join(projectRoot, 'openspec', 'changes');
const openspec = path.join(productRoot, 'node_modules', '.bin', 'openspec');
const commandEnv = { ...process.env, PATH: `${path.dirname(openspec)}${path.delimiter}${process.env.PATH || ''}` };

function fail(message) {
  throw new Error(message);
}

function run(args, expected = 0) {
  const result = spawnSync(process.execPath, [buildr, ...args], { cwd: productRoot, encoding: 'utf8', env: commandEnv });
  if (result.status !== expected) {
    fail(`buildr ${args.join(' ')} exited ${result.status}, expected ${expected}: ${(result.stderr || result.stdout).trim()}`);
  }
  const payload = args.includes('--json') && result.stdout.trim() ? JSON.parse(result.stdout) : null;
  if (payload && args[0] === 'openspec') {
    const expectedSchema = args[1] === 'baseline' ? 'buildr.openspec-baseline/v1' : 'buildr.openspec-check/v1';
    if (payload.schemaVersion !== expectedSchema) fail(`Expected ${expectedSchema}, got ${payload.schemaVersion}`);
  }
  return payload;
}

function runUpstream(args, cwd = projectRoot, expected = 0) {
  const result = spawnSync(openspec, args, { cwd, encoding: 'utf8', env: commandEnv });
  if (result.status !== expected) {
    fail(`openspec ${args.join(' ')} exited ${result.status}, expected ${expected}: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function requirement(title, detail) {
  return [
    `### Requirement: ${title}`,
    `系统 MUST ${detail}。`,
    '',
    `#### Scenario: ${title} works`,
    '- **WHEN** 条件满足',
    '- **THEN** 结果成立',
    '',
  ].join('\n');
}

function canonical(capability, blocks) {
  write(path.join(specsRoot, capability, 'spec.md'), `# ${capability} Specification\n\n## Requirements\n${blocks.join('\n')}`);
}

function change(id, capability, kind, delta) {
  const isNew = kind === 'new';
  write(path.join(changesRoot, id, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2026-07-11\n');
  write(path.join(changesRoot, id, 'proposal.md'), [
    '## Capabilities',
    '',
    '### New Capabilities',
    ...(isNew ? [`- \`${capability}\`: fixture`] : []),
    '',
    '### Modified Capabilities',
    ...(!isNew ? [`- \`${capability}\`: fixture`] : []),
    '',
  ].join('\n'));
  write(path.join(changesRoot, id, 'specs', capability, 'spec.md'), delta);
}

function removeChange(id) {
  fs.rmSync(path.join(changesRoot, id), { recursive: true, force: true });
}

function baseline(id, options = []) {
  return run(['openspec', 'baseline', 'create', id, '--project', project, '--target', root, '--json', ...options]);
}

function check(id, stage, expected = 0) {
  return run(['openspec', 'check', id, '--stage', stage, '--project', project, '--target', root, '--json'], expected);
}

function assertError(result, code) {
  if (!result.findings.some((finding) => finding.code === code)) fail(`Expected finding ${code}: ${JSON.stringify(result.findings)}`);
}

try {
  if (runUpstream(['--version'], productRoot).stdout.trim() !== '1.6.0') fail('OpenSpec contract fixtures must execute the bundled 1.6.0 CLI');
  run(['init', '--target', root, '--name', 'contract-fixture', '--profile', 'team']);
  run(['project', 'create', project, '--target', root]);
  write(path.join(projectRoot, 'openspec', 'config.yaml'), 'schema: spec-driven\n');

  const existing = requirement('Existing', '保留既有行为');
  const untouched = requirement('Untouched', '保持不变');
  canonical('demo', [existing, untouched]);

  const unknownProject = spawnSync(process.execPath, [buildr, 'openspec', 'check', 'missing', '--stage', 'proposal', '--project', 'missing', '--target', root, '--json'], { cwd: productRoot, encoding: 'utf8', env: commandEnv });
  if (unknownProject.status === 0 || !unknownProject.stderr.includes('Project is not registered')) fail('unknown Project must be rejected before OpenSpec sidecar access');

  const modified = requirement('Existing', '使用更新后的行为');
  change('safe-modified', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  baseline('safe-modified');
  if (!check('safe-modified', 'proposal').ok) fail('safe modified proposal check must pass');
  if (!check('safe-modified', 'pre-sync').ok) fail('safe modified pre-sync check must pass');
  canonical('demo', [modified, untouched]);
  if (!check('safe-modified', 'post-sync').ok) fail('safe modified post-sync check must pass');
  const safeModifiedReceipt = JSON.parse(fs.readFileSync(path.join(changesRoot, 'safe-modified', '.buildr', 'contract-pre-sync-receipt.json'), 'utf8'));
  if (!safeModifiedReceipt.postSyncSpecIntegrities?.demo?.startsWith('sha256-')) fail('post-sync receipt must bind the resulting canonical spec integrity');
  removeChange('safe-modified');

  const added = requirement('Added', '提供新增能力');
  change('safe-added', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
  baseline('safe-added');
  check('safe-added', 'pre-sync');
  canonical('demo', [modified, untouched, added]);
  if (!check('safe-added', 'post-sync').ok) fail('safe added post-sync check must pass');
  removeChange('safe-added');

  change('safe-removed', 'demo', 'modified', `## REMOVED Requirements\n\n${added}`);
  baseline('safe-removed');
  check('safe-removed', 'pre-sync');
  canonical('demo', [modified, untouched]);
  if (!check('safe-removed', 'post-sync').ok) fail('safe removed post-sync check must pass');
  removeChange('safe-removed');

  const legacy = requirement('Legacy', '保留名称前的内容');
  canonical('demo', [legacy, untouched]);
  change('safe-renamed', 'demo', 'modified', '## RENAMED Requirements\n\n- FROM: `### Requirement: Legacy`\n- TO: `### Requirement: Modern`\n');
  baseline('safe-renamed');
  check('safe-renamed', 'pre-sync');
  canonical('demo', [legacy.replace('### Requirement: Legacy', '### Requirement: Modern'), untouched]);
  if (!check('safe-renamed', 'post-sync').ok) fail('safe renamed post-sync check must pass');
  removeChange('safe-renamed');

  canonical('demo', [existing, untouched]);
  change('proposal-mismatch', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  baseline('proposal-mismatch');
  write(path.join(changesRoot, 'proposal-mismatch', 'proposal.md'), '## Capabilities\n\n### New Capabilities\n\n### Modified Capabilities\n');
  assertError(check('proposal-mismatch', 'proposal', 1), 'openspec_contract.proposal_delta_missing');
  removeChange('proposal-mismatch');

  change('incomplete-baseline', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  baseline('incomplete-baseline');
  fs.appendFileSync(path.join(changesRoot, 'incomplete-baseline', 'specs', 'demo', 'spec.md'), `\n## ADDED Requirements\n\n${requirement('Later', '在基线后新增')}`);
  assertError(check('incomplete-baseline', 'proposal', 1), 'openspec_contract.baseline_incomplete');
  removeChange('incomplete-baseline');

  change('adopted', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  const adopted = baseline('adopted', ['--adopt-current']);
  if (adopted.adopted !== true) fail('explicit adopted baseline must be marked in JSON output');
  removeChange('adopted');

  change('corrupt-baseline', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  baseline('corrupt-baseline');
  fs.writeFileSync(path.join(changesRoot, 'corrupt-baseline', '.buildr', 'contract-baseline.json'), '{ invalid json\n');
  assertError(check('corrupt-baseline', 'proposal', 1), 'openspec_contract.baseline_invalid');
  removeChange('corrupt-baseline');

  canonical('demo', [existing, untouched]);
  change('conflict-a', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  change('conflict-b', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  baseline('conflict-a');
  baseline('conflict-b');
  assertError(check('conflict-a', 'pre-sync', 1), 'openspec_contract.active_conflict');
  removeChange('conflict-a');
  removeChange('conflict-b');

  change('stale', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  baseline('stale');
  canonical('demo', [requirement('Existing', '已被前序 change 改变'), untouched]);
  assertError(check('stale', 'pre-sync', 1), 'openspec_contract.baseline_stale');
  removeChange('stale');

  canonical('demo', [existing, untouched]);
  change('occupied-added', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
  baseline('occupied-added');
  canonical('demo', [existing, untouched, added]);
  assertError(check('occupied-added', 'pre-sync', 1), 'openspec_contract.baseline_stale');
  removeChange('occupied-added');

  canonical('demo', [existing, untouched]);
  change('partial', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  baseline('partial');
  check('partial', 'pre-sync');
  canonical('demo', [modified, requirement('Untouched', '被错误改写')]);
  assertError(check('partial', 'post-sync', 1), 'openspec_contract.post_sync_untouched_changed');
  removeChange('partial');

  canonical('demo', [existing, untouched]);
  change('receipt-changed', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  baseline('receipt-changed');
  check('receipt-changed', 'pre-sync');
  fs.appendFileSync(path.join(changesRoot, 'receipt-changed', 'specs', 'demo', 'spec.md'), '\n<!-- fixture mutation -->\n');
  assertError(check('receipt-changed', 'post-sync', 1), 'openspec_contract.receipt_delta_changed');
  removeChange('receipt-changed');

  change('missing-baseline', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  assertError(check('missing-baseline', 'proposal', 1), 'openspec_contract.baseline_missing');
  removeChange('missing-baseline');

  const definition = path.join(root, 'components', 'buildr', 'openspec', 'component.yml');
  const originalDefinition = fs.readFileSync(definition, 'utf8');
  fs.writeFileSync(definition, originalDefinition.replace('version: "1.6.0"', 'version: "9.9.9"'));
  change('unsupported-upstream', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`);
  const unsupported = spawnSync(process.execPath, [buildr, 'openspec', 'baseline', 'create', 'unsupported-upstream', '--project', project, '--target', root, '--json'], { cwd: productRoot, encoding: 'utf8', env: commandEnv });
  if (unsupported.status === 0 || !unsupported.stderr.includes('does not support upstream version')) fail('unsupported OpenSpec upstream version must fail closed');
  fs.writeFileSync(definition, originalDefinition);
  removeChange('unsupported-upstream');

  const preserved = [
    '### Requirement: Preserve scenarios',
    '系统 MUST 保留全部既有场景。',
    '',
    '#### Scenario: first scenario',
    '- **WHEN** 第一条件满足',
    '- **THEN** 第一结果成立',
    '',
    '#### Scenario: second scenario',
    '- **WHEN** 第二条件满足',
    '- **THEN** 第二结果成立',
    '',
  ].join('\n');
  const staleModification = [
    '## MODIFIED Requirements',
    '',
    '### Requirement: Preserve scenarios',
    '系统 MUST 只保留第一个场景。',
    '',
    '#### Scenario: first scenario',
    '- **WHEN** 第一条件满足',
    '- **THEN** 第一结果成立',
    '',
  ].join('\n');
  canonical('upstream-archive', [preserved]);
  change('upstream-archive-safety', 'upstream-archive', 'modified', staleModification);
  write(path.join(changesRoot, 'upstream-archive-safety', 'design.md'), '# Design\n');
  write(path.join(changesRoot, 'upstream-archive-safety', 'tasks.md'), '- [x] Archive safety fixture\n');
  runUpstream(['validate', 'upstream-archive-safety', '--strict'], projectRoot);
  const archive = runUpstream(['archive', 'upstream-archive-safety', '--yes', '--json'], projectRoot, 1);
  if (!/current spec contains scenario\(s\) not present|Refresh the change spec before archiving/.test(`${archive.stdout}\n${archive.stderr}`)) {
    fail(`OpenSpec 1.6 archive must reject a MODIFIED requirement that drops an existing scenario: ${(archive.stderr || archive.stdout).trim()}`);
  }
  removeChange('upstream-archive-safety');

  console.log('OpenSpec contract fixtures passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
