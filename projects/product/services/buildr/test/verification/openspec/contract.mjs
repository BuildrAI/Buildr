#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const buildr = path.join(productRoot, 'bin', 'buildr.mjs');
const openspec = path.join(productRoot, 'node_modules', '.bin', 'openspec');
const commandEnv = { ...process.env, PATH: `${path.dirname(openspec)}${path.delimiter}${process.env.PATH || ''}` };
const project = 'demo';
const argv = process.argv.slice(2);
const optionValue = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
};
const selectedCase = optionValue('--case');
const selectedSuite = optionValue('--suite') || 'all';
const listSuites = argv.includes('--list-suites');
const root = selectedCase ? process.env.BUILDR_OPENSPEC_FIXTURE_ROOT : null;
const projectRoot = root ? path.join(root, 'projects', project) : null;
const specsRoot = projectRoot ? path.join(projectRoot, 'openspec', 'specs') : null;
const changesRoot = projectRoot ? path.join(projectRoot, 'openspec', 'changes') : null;

function fail(message) { throw new Error(message); }
function run(args, expected = 0, fixtureRoot = root) {
  const result = spawnSync(process.execPath, [buildr, ...args], { cwd: productRoot, encoding: 'utf8', env: commandEnv });
  if (result.status !== expected) fail(`buildr ${args.join(' ')} exited ${result.status}, expected ${expected}: ${(result.stderr || result.stdout).trim()}`);
  const payload = args.includes('--json') && result.stdout.trim() ? JSON.parse(result.stdout) : null;
  if (payload && args[0] === 'openspec') {
    const expectedSchema = args[1] === 'baseline' ? 'buildr.openspec-baseline/v1'
      : args[1] === 'converge' ? 'buildr.openspec-convergence/v1'
        : args[1] === 'audit' ? 'buildr.openspec-convergence-audit/v1' : 'buildr.openspec-check/v1';
    if (payload.schemaVersion !== expectedSchema) fail(`Expected ${expectedSchema}, got ${payload.schemaVersion}`);
  }
  return payload;
}
function runUpstream(args, cwd = projectRoot, expected = 0) {
  const result = spawnSync(openspec, args, { cwd, encoding: 'utf8', env: commandEnv });
  if (result.status !== expected) fail(`openspec ${args.join(' ')} exited ${result.status}, expected ${expected}: ${(result.error?.message || result.stderr || result.stdout || '').trim()}`);
  return result;
}
function write(file, content) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function requirement(title, detail) {
  return [`### Requirement: ${title}`, `系统 MUST ${detail}。`, '', `#### Scenario: ${title} works`, '- **WHEN** 条件满足', '- **THEN** 结果成立', ''].join('\n');
}
function canonical(capability, blocks) { write(path.join(specsRoot, capability, 'spec.md'), `# ${capability} Specification\n\n## Purpose\n\nFixture purpose provides enough detail for strict validation and contract behavior verification.\n\n## Requirements\n${blocks.join('\n')}`); }
function change(id, capability, kind, delta) {
  const isNew = kind === 'new';
  write(path.join(changesRoot, id, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2026-07-11\n');
  write(path.join(changesRoot, id, 'proposal.md'), ['## Capabilities', '', '### New Capabilities', ...(isNew ? [`- \`${capability}\`: fixture`] : []), '', '### Modified Capabilities', ...(!isNew ? [`- \`${capability}\`: fixture`] : []), ''].join('\n'));
  write(path.join(changesRoot, id, 'design.md'), '## Context\n\nFixture design.\n');
  write(path.join(changesRoot, id, 'tasks.md'), '- [x] Complete fixture implementation\n');
  write(path.join(changesRoot, id, 'specs', capability, 'spec.md'), delta);
}
function removeChange(id) { fs.rmSync(path.join(changesRoot, id), { recursive: true, force: true }); }
function baseline(id, options = []) { return run(['openspec', 'baseline', 'create', id, '--project', project, '--target', root, '--json', ...options]); }
function check(id, stage, expected = 0) { return run(['openspec', 'check', id, '--stage', stage, '--project', project, '--target', root, '--json'], expected); }
function converge(id, expected = 0) { return run(['openspec', 'converge', id, '--project', project, '--target', root, '--json'], expected); }
function audit(id, expected = 0) { return run(['openspec', 'audit', id, '--project', project, '--target', root, '--json'], expected); }
function assertError(result, code) { if (!result.findings.some((finding) => finding.code === code)) fail(`Expected finding ${code}: ${JSON.stringify(result.findings)}`); }

const existing = requirement('Existing', '保留既有行为');
const untouched = requirement('Untouched', '保持不变');
const modified = requirement('Existing', '使用更新后的行为');
const added = requirement('Added', '提供新增能力');

const cases = {
  'unknown-project'() {
    const result = spawnSync(process.execPath, [buildr, 'openspec', 'check', 'missing', '--stage', 'proposal', '--project', 'missing', '--target', root, '--json'], { cwd: productRoot, encoding: 'utf8', env: commandEnv });
    if (result.status === 0 || !result.stderr.includes('Project is not registered')) fail('unknown Project must be rejected before sidecar access');
  },
  'safe-modified'() {
    change('safe-modified', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); const baselineResult = baseline('safe-modified');
    const proposalResult = check('safe-modified', 'proposal');
    if (baselineResult.deprecation?.status !== 'deprecated-compatible' || proposalResult.deprecation?.replacement !== 'openspec converge' || !check('safe-modified', 'pre-sync').ok) fail('legacy guards must pass with structured deprecation');
    canonical('demo', [modified, untouched]); if (!check('safe-modified', 'post-sync').ok) fail('safe modified post-sync must pass');
    const receipt = JSON.parse(fs.readFileSync(path.join(changesRoot, 'safe-modified', '.buildr', 'contract-pre-sync-receipt.json'), 'utf8'));
    if (!receipt.postSyncSpecIntegrities?.demo?.startsWith('sha256-')) fail('post-sync receipt must bind canonical integrity');
  },
  'safe-added'() {
    change('safe-added', 'demo', 'modified', `## ADDED Requirements\n\n${added}`); baseline('safe-added'); check('safe-added', 'pre-sync');
    canonical('demo', [existing, untouched, added]); if (!check('safe-added', 'post-sync').ok) fail('safe added post-sync must pass');
  },
  'safe-removed'() {
    canonical('demo', [existing, untouched, added]); change('safe-removed', 'demo', 'modified', `## REMOVED Requirements\n\n${added}`); baseline('safe-removed'); check('safe-removed', 'pre-sync');
    canonical('demo', [existing, untouched]); if (!check('safe-removed', 'post-sync').ok) fail('safe removed post-sync must pass');
  },
  'safe-renamed'() {
    const legacy = requirement('Legacy', '保留名称前的内容'); canonical('demo', [legacy, untouched]);
    change('safe-renamed', 'demo', 'modified', '## RENAMED Requirements\n\n- FROM: `### Requirement: Legacy`\n- TO: `### Requirement: Modern`\n'); baseline('safe-renamed'); check('safe-renamed', 'pre-sync');
    canonical('demo', [legacy.replace('### Requirement: Legacy', '### Requirement: Modern'), untouched]); if (!check('safe-renamed', 'post-sync').ok) fail('safe renamed post-sync must pass');
  },
  'proposal-and-baseline-errors'() {
    change('proposal-mismatch', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); baseline('proposal-mismatch');
    write(path.join(changesRoot, 'proposal-mismatch', 'proposal.md'), '## Capabilities\n\n### New Capabilities\n\n### Modified Capabilities\n'); assertError(check('proposal-mismatch', 'proposal', 1), 'openspec_contract.proposal_delta_missing'); removeChange('proposal-mismatch');
    change('incomplete-baseline', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); baseline('incomplete-baseline'); fs.appendFileSync(path.join(changesRoot, 'incomplete-baseline', 'specs', 'demo', 'spec.md'), `\n## ADDED Requirements\n\n${requirement('Later', '在基线后新增')}`); assertError(check('incomplete-baseline', 'proposal', 1), 'openspec_contract.baseline_incomplete'); removeChange('incomplete-baseline');
    change('missing-baseline', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); assertError(check('missing-baseline', 'proposal', 1), 'openspec_contract.baseline_missing');
  },
  'adopted-and-corrupt'() {
    change('adopted', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); if (baseline('adopted', ['--adopt-current']).adopted !== true) fail('adopted baseline must be marked'); removeChange('adopted');
    change('corrupt-baseline', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); baseline('corrupt-baseline'); fs.writeFileSync(path.join(changesRoot, 'corrupt-baseline', '.buildr', 'contract-baseline.json'), '{ invalid json\n'); assertError(check('corrupt-baseline', 'proposal', 1), 'openspec_contract.baseline_invalid');
  },
  'conflict'() {
    change('conflict-a', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); change('conflict-b', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); baseline('conflict-a'); baseline('conflict-b'); assertError(check('conflict-a', 'pre-sync', 1), 'openspec_contract.active_conflict');
  },
  'stale-and-occupied'() {
    change('stale', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); baseline('stale'); canonical('demo', [requirement('Existing', '已被前序 change 改变'), untouched]); assertError(check('stale', 'pre-sync', 1), 'openspec_contract.baseline_stale'); removeChange('stale');
    canonical('demo', [existing, untouched]); change('occupied-added', 'demo', 'modified', `## ADDED Requirements\n\n${added}`); baseline('occupied-added'); canonical('demo', [existing, untouched, added]); assertError(check('occupied-added', 'pre-sync', 1), 'openspec_contract.baseline_stale');
  },
  'post-sync-errors'() {
    change('partial', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); baseline('partial'); check('partial', 'pre-sync');
    const mismatch = check('partial', 'post-sync', 1); const finding = mismatch.findings.find((item) => item.code === 'openspec_contract.post_sync_result_mismatch');
    if (!finding || finding.operation !== 'MODIFIED' || !finding.expectedSummary?.startsWith('sha256-') || !finding.actualSummary?.startsWith('sha256-') || !finding.nextAction?.includes('完整文本')) fail('post-sync mismatch diagnostic incomplete');
    canonical('demo', [modified, requirement('Untouched', '被错误改写')]); assertError(check('partial', 'post-sync', 1), 'openspec_contract.post_sync_untouched_changed'); removeChange('partial');
    canonical('demo', [existing, untouched]); change('receipt-changed', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); baseline('receipt-changed'); check('receipt-changed', 'pre-sync'); fs.appendFileSync(path.join(changesRoot, 'receipt-changed', 'specs', 'demo', 'spec.md'), '\n<!-- fixture mutation -->\n'); assertError(check('receipt-changed', 'post-sync', 1), 'openspec_contract.receipt_delta_changed');
  },
  'unsupported-upstream'() {
    const definition = path.join(root, 'components', 'buildr', 'openspec', 'component.yml'); const original = fs.readFileSync(definition, 'utf8'); fs.writeFileSync(definition, original.replace('version: "1.6.0"', 'version: "9.9.9"'));
    change('unsupported-upstream', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); const result = spawnSync(process.execPath, [buildr, 'openspec', 'baseline', 'create', 'unsupported-upstream', '--project', project, '--target', root, '--json'], { cwd: productRoot, encoding: 'utf8', env: commandEnv });
    if (result.status === 0 || !result.stderr.includes('does not support upstream version')) fail('unsupported upstream must fail closed');
  },
  'upstream-archive-safety'() {
    const preserved = ['### Requirement: Preserve scenarios', '系统 MUST 保留全部既有场景。', '', '#### Scenario: first scenario', '- **WHEN** 第一条件满足', '- **THEN** 第一结果成立', '', '#### Scenario: second scenario', '- **WHEN** 第二条件满足', '- **THEN** 第二结果成立', ''].join('\n');
    const stale = ['## MODIFIED Requirements', '', '### Requirement: Preserve scenarios', '系统 MUST 只保留第一个场景。', '', '#### Scenario: first scenario', '- **WHEN** 第一条件满足', '- **THEN** 第一结果成立', ''].join('\n');
    canonical('upstream-archive', [preserved]); change('upstream-archive-safety', 'upstream-archive', 'modified', stale); write(path.join(changesRoot, 'upstream-archive-safety', 'design.md'), '# Design\n'); write(path.join(changesRoot, 'upstream-archive-safety', 'tasks.md'), '- [x] Archive safety fixture\n');
    runUpstream(['validate', 'upstream-archive-safety', '--strict'], projectRoot); const archived = runUpstream(['archive', 'upstream-archive-safety', '--yes', '--json'], projectRoot, 1);
    if (!/current spec contains scenario\(s\) not present|Refresh the change spec before archiving/.test(`${archived.stdout}\n${archived.stderr}`)) fail('OpenSpec archive must reject dropped scenario');
  },
  'convergence-transaction-safe'() {
    change('convergence-safe', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    const result = converge('convergence-safe');
    if (result.status !== 'passed' || result.disposition !== 'archived' || result.commandCount < 3) fail(`convergence safe result incomplete: ${JSON.stringify(result)}`);
    const canonicalContent = fs.readFileSync(path.join(specsRoot, 'demo', 'spec.md'), 'utf8');
    if (!canonicalContent.includes('Requirement: Added')) fail('convergence did not apply canonical result');
    const archived = fs.readdirSync(path.join(changesRoot, 'archive')).find((name) => name.endsWith('-convergence-safe'));
    if (!archived) fail('convergence did not archive Change');
    const buildrRoot = path.join(changesRoot, 'archive', archived, '.buildr');
    const receipt = JSON.parse(fs.readFileSync(path.join(buildrRoot, 'convergence-receipt.json'), 'utf8'));
    if (receipt.disposition !== 'archived' || fs.readdirSync(buildrRoot).some((name) => ['contract-pre-sync-receipt.json', 'deterministic-sync-plan.json', 'deterministic-convergence.json', 'convergence-recovery.json'].includes(name))) fail('new convergence wrote legacy sidecars');
    const repeated = converge('convergence-safe');
    if (repeated.status !== 'passed' || repeated.commandCount !== 0) fail('archived convergence repeat must be idempotent');
    const audited = audit('convergence-safe');
    if (audited.status !== 'passed' || audited.disposition !== 'archived' || audited.files.some((item) => !['before', 'expected'].includes(item.state))) fail('archived convergence audit must report actual file facts');
  },
  'convergence-audit-unprovable'() {
    change('audit-missing', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    const missing = audit('audit-missing', 2);
    if (missing.status !== 'recovery-unprovable' || missing.diagnostic?.code !== 'convergence-receipt-unprovable') fail('missing receipt audit must fail closed');
    removeChange('audit-missing');
    change('audit-unknown', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    if (converge('audit-unknown').status !== 'passed') fail('audit fixture convergence failed');
    fs.appendFileSync(path.join(specsRoot, 'demo', 'spec.md'), '\nmanual drift\n');
    const unknown = audit('audit-unknown', 2);
    if (unknown.status !== 'recovery-unprovable' || unknown.disposition !== 'state-unknown' || !unknown.files.some((item) => item.state === 'unknown')) fail('unknown audit must report per-file actual digest');
  },
  'convergence-transaction-conflict-and-disjoint'() {
    change('same-a', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    change('same-b', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    const blocked = converge('same-a', 2);
    if (blocked.status !== 'blocked' || blocked.code !== 'semantic-resolution-required') fail('same Requirement changes must block');
    removeChange('same-a'); removeChange('same-b');
    const one = requirement('FirstDisjoint', '提供第一项不相交能力');
    const two = requirement('SecondDisjoint', '提供第二项不相交能力');
    change('disjoint-a', 'demo', 'modified', `## ADDED Requirements\n\n${one}`);
    change('disjoint-b', 'demo', 'modified', `## ADDED Requirements\n\n${two}`);
    if (converge('disjoint-a').status !== 'passed') fail('first disjoint Change must converge');
    if (converge('disjoint-b').status !== 'passed') fail('second disjoint Change must replan and converge');
    const actual = fs.readFileSync(path.join(specsRoot, 'demo', 'spec.md'), 'utf8');
    if (!actual.includes('FirstDisjoint') || !actual.includes('SecondDisjoint')) fail('disjoint convergence overwrote prior canonical content');
  },
};

const suites = Object.freeze({
  contract: Object.freeze([
    'unknown-project',
    'safe-modified',
    'safe-added',
    'safe-removed',
    'safe-renamed',
    'proposal-and-baseline-errors',
    'adopted-and-corrupt',
    'conflict',
    'stale-and-occupied',
    'unsupported-upstream',
  ]),
  recovery: Object.freeze([
    'post-sync-errors',
    'upstream-archive-safety',
    'convergence-transaction-safe',
    'convergence-audit-unprovable',
    'convergence-transaction-conflict-and-disjoint',
  ]),
});

const allCases = Object.freeze([...suites.contract, ...suites.recovery]);

function validateSuiteRegistry() {
  const registered = Object.keys(cases).sort();
  const selected = [...new Set(allCases)].sort();
  if (selected.length !== allCases.length) fail('OpenSpec fixture suites overlap');
  if (JSON.stringify(selected) !== JSON.stringify(registered)) fail('OpenSpec fixture suites do not cover every registered case');
}

async function prepareBase(baseRoot) {
  const startedAt = Date.now();
  if (runUpstream(['--version'], productRoot).stdout.trim() !== '1.6.0') fail('OpenSpec contract fixtures must execute bundled 1.6.0 CLI');
  run(['init', '--target', baseRoot, '--name', 'contract-fixture', '--profile', 'team'], 0, baseRoot);
  run(['project', 'create', project, '--target', baseRoot], 0, baseRoot);
  const baseProject = path.join(baseRoot, 'projects', project);
  write(path.join(baseProject, 'openspec', 'config.yaml'), 'schema: spec-driven\n');
  const baseSpecs = path.join(baseProject, 'openspec', 'specs', 'demo', 'spec.md');
  write(baseSpecs, `# demo Specification\n\n## Purpose\n\nFixture purpose provides enough detail for strict validation and contract behavior verification.\n\n## Requirements\n${existing}\n${untouched}`);
  return Date.now() - startedAt;
}

function runCase(name, caseRoot) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--case', name], { cwd: productRoot, env: { ...commandEnv, BUILDR_OPENSPEC_FIXTURE_ROOT: caseRoot }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ name, status: code === 0 ? 'passed' : 'failed', exitCode: code, durationMs: Date.now() - startedAt, stdout, stderr, fixture: caseRoot }));
  });
}

async function main() {
  validateSuiteRegistry();
  if (listSuites) {
    console.log(JSON.stringify({ contract: suites.contract, recovery: suites.recovery, all: allCases }));
    return;
  }
  if (selectedCase) { const execute = cases[selectedCase]; if (!execute) fail(`Unknown fixture case: ${selectedCase}`); execute(); return; }
  const names = selectedSuite === 'all' ? allCases : suites[selectedSuite];
  if (!names) fail(`Unknown OpenSpec fixture suite: ${selectedSuite}`);
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-contract-run-'));
  const baseRoot = path.join(runRoot, 'prepared');
  const startedAt = Date.now();
  let results = [];
  try {
    const preparationMs = await prepareBase(baseRoot);
    const concurrency = Math.min(12, names.length);
    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      const owned = [];
      while (cursor < names.length) {
        const index = cursor; cursor += 1;
        const name = names[index]; const caseRoot = path.join(runRoot, `case-${String(index).padStart(2, '0')}-${name}`);
        fs.cpSync(baseRoot, caseRoot, { recursive: true });
        owned.push(await runCase(name, caseRoot));
      }
      return owned;
    });
    results = (await Promise.all(workers)).flat().sort((left, right) => Object.keys(cases).indexOf(left.name) - Object.keys(cases).indexOf(right.name));
    const failed = results.filter((item) => item.status === 'failed');
    const evidence = {
      schemaVersion: 'buildr.openspec-contract-fixtures/v1',
      status: failed.length ? 'failed' : 'passed',
      suite: selectedSuite,
      preparation: { status: 'passed', durationMs: preparationMs, identity: `sha256-${crypto.createHash('sha256').update([process.version, process.platform, '1.6.0', fs.readFileSync(fileURLToPath(import.meta.url))].join('\0')).digest('hex')}` },
      consumers: results.map(({ name, status, exitCode, durationMs }) => ({ name, status, exitCode, durationMs, reusedPreparation: true })),
      consumerCount: results.length,
      concurrency,
      wallClockMs: Date.now() - startedAt,
      budgetMs: 30000,
      withinBudget: Date.now() - startedAt <= 30000,
    };
    if (failed.length) {
      for (const item of failed) process.stderr.write(`[${item.name}] ${item.stderr || item.stdout}\nfixture: ${item.fixture}\n`);
      process.stderr.write(`${JSON.stringify(evidence)}\n`);
      process.exitCode = 1;
      return;
    }
    console.log('OpenSpec contract fixtures passed.');
    console.log(`[openspec-contract-fixtures] evidence: ${JSON.stringify(evidence)}`);
  } finally {
    if (!results.some((item) => item.status === 'failed')) fs.rmSync(runRoot, { recursive: true, force: true });
  }
}

await main();
