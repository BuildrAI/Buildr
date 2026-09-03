#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { spawnCommandSync } from '../../../src/infrastructure/process.mjs';
import { resolveVerificationWorkerBudget } from '../worker-budget.mjs';
import { createConvergencePlan } from '../../../src/task/openspec/application/convergence-planner.ts';
import { createConvergenceReceipt } from '../../../src/task/openspec/application/convergence-model.ts';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const buildr = path.join(productRoot, 'bin', 'buildr.mjs');
const openspec = path.join(productRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'openspec.cmd' : 'openspec');
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
    const expectedSchema = args[1] === 'converge' ? 'buildr.openspec-convergence/v1'
      : args[2] === 'preflight' ? 'buildr.openspec-convergence-preflight/v1'
      : 'buildr.openspec-convergence-inspect/v1';
    if (payload.schemaVersion !== expectedSchema) fail(`Expected ${expectedSchema}, got ${payload.schemaVersion}`);
  }
  return payload;
}
function runUpstream(args, cwd = projectRoot, expected = 0) {
  const result = spawnCommandSync(openspec, args, { cwd, encoding: 'utf8', env: commandEnv });
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
function converge(id, expected = 0) { return run(['openspec', 'converge', id, '--project', project, '--target', root, '--json'], expected); }
function preflight(id, expected = 0) { return run(['openspec', 'convergence', 'preflight', id, '--project', project, '--target', root, '--json'], expected); }
function inspect(id, expected = 0) { return run(['openspec', 'convergence', 'inspect', id, '--project', project, '--target', root, '--json'], expected); }
function writeTransactionReceipt(id, operation) {
  const canonicalFile = path.join(specsRoot, 'demo', 'spec.md');
  const content = fs.readFileSync(canonicalFile, 'utf8');
  const executableIdentity = { sourceKind: 'external-declared', reference: 'external:openspec', version: '1.6.0', sha256: 'fixture' };
  const delta = { hash: `sha256-${crypto.createHash('sha256').update(JSON.stringify(operation)).digest('hex')}`, operations: [operation], capabilities: new Map([['demo', { operations: [operation] }]]) };
  const plan = createConvergencePlan({
    change: id, project, delta, executableIdentity,
    canonicalFiles: new Map([['demo', { path: 'openspec/specs/demo/spec.md', exists: true, content }]]),
    capabilityPurposes: new Map(), activeConflicts: [],
  });
  if (plan.status !== 'safe') fail(`fixture transaction plan blocked: ${JSON.stringify(plan.blocked)}`);
  const receipt = createConvergenceReceipt({ plan, executableIdentity });
  write(path.join(changesRoot, id, '.buildr', 'convergence-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return { plan, receipt, canonicalFile };
}

const existing = requirement('Existing', '保留既有行为');
const untouched = requirement('Untouched', '保持不变');
const modified = requirement('Existing', '使用更新后的行为');
const added = requirement('Added', '提供新增能力');

const cases = {
  'unknown-project'() {
    const result = spawnSync(process.execPath, [buildr, 'openspec', 'converge', 'missing', '--project', 'missing', '--target', root, '--json'], { cwd: productRoot, encoding: 'utf8', env: commandEnv });
    if (result.status === 0 || !result.stderr.includes('Project is not registered')) fail('unknown Project must be rejected before sidecar access');
  },
  'unsupported-upstream'() {
    const definition = path.join(root, 'components', 'buildr', 'openspec', 'component.yml'); const original = fs.readFileSync(definition, 'utf8'); fs.writeFileSync(definition, original.replace('version: "1.6.0"', 'version: "9.9.9"'));
    change('unsupported-upstream', 'demo', 'modified', `## MODIFIED Requirements\n\n${modified}`); const result = spawnSync(process.execPath, [buildr, 'openspec', 'converge', 'unsupported-upstream', '--project', project, '--target', root, '--json'], { cwd: productRoot, encoding: 'utf8', env: commandEnv });
    if (result.status === 0 || !result.stderr.includes('does not support upstream version')) fail('unsupported upstream must fail closed');
  },
  'upstream-archive-safety'() {
    const preserved = ['### Requirement: Preserve scenarios', '系统 MUST 保留全部既有场景。', '', '#### Scenario: first scenario', '- **WHEN** 第一条件满足', '- **THEN** 第一结果成立', '', '#### Scenario: second scenario', '- **WHEN** 第二条件满足', '- **THEN** 第二结果成立', ''].join('\n');
    const stale = ['## MODIFIED Requirements', '', '### Requirement: Preserve scenarios', '系统 MUST 只保留第一个场景。', '', '#### Scenario: first scenario', '- **WHEN** 第一条件满足', '- **THEN** 第一结果成立', ''].join('\n');
    canonical('upstream-archive', [preserved]); change('upstream-archive-safety', 'upstream-archive', 'modified', stale); write(path.join(changesRoot, 'upstream-archive-safety', 'design.md'), '# Design\n'); write(path.join(changesRoot, 'upstream-archive-safety', 'tasks.md'), '- [x] Archive safety fixture\n');
    runUpstream(['validate', 'upstream-archive-safety', '--strict'], projectRoot); const archived = runUpstream(['archive', 'upstream-archive-safety', '--yes', '--json'], projectRoot, 1);
    if (!/current spec contains scenario\(s\) not present|Refresh the change spec before archiving/.test(`${archived.stdout}\n${archived.stderr}`)) fail('OpenSpec archive must reject dropped scenario');
  },
  'convergence-preflight-ready-and-current'() {
    change('preflight-ready', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    const canonicalFile = path.join(specsRoot, 'demo', 'spec.md');
    const beforeCanonical = fs.readFileSync(canonicalFile, 'utf8');
    const first = preflight('preflight-ready');
    if (first.status !== 'ready' || first.effects.length !== 0 || first.commandCount < 3) fail(`preflight ready result incomplete: ${JSON.stringify(first)}`);
    if (fs.readFileSync(canonicalFile, 'utf8') !== beforeCanonical) fail('preflight must not mutate canonical specs');
    if (fs.existsSync(path.join(changesRoot, 'preflight-ready', '.buildr'))) fail('preflight must not create a Change sidecar');
    if (!fs.existsSync(path.join(changesRoot, 'preflight-ready', '.openspec.yaml'))) fail('preflight must not archive the Change');
    const repeated = preflight('preflight-ready');
    if (repeated.readinessIdentity !== first.readinessIdentity || repeated.planIdentity !== first.planIdentity) fail('same preflight inputs must keep identity stable');

    const disjoint = requirement('PreflightDisjoint', '提供不相交的active Change能力');
    change('preflight-disjoint', 'demo', 'modified', `## ADDED Requirements\n\n${disjoint}`);
    const changed = preflight('preflight-ready');
    if (changed.status !== 'ready' || changed.planIdentity !== first.planIdentity || changed.readinessIdentity === first.readinessIdentity) fail('active Change observation must invalidate readiness without changing the convergence plan');
    removeChange('preflight-ready'); removeChange('preflight-disjoint');
  },
  'convergence-preflight-semantic-blockers'() {
    change('preflight-active-a', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    change('preflight-active-b', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    const active = preflight('preflight-active-a', 2);
    if (active.status !== 'blocked' || !active.blockers.some((item) => item.category === 'active-change-conflict' && item.change === 'preflight-active-b')) fail('preflight must classify active Change conflicts');
    removeChange('preflight-active-a'); removeChange('preflight-active-b');

    const preserved = ['### Requirement: Preserve scenarios', '系统 MUST 保留全部既有场景。', '', '#### Scenario: first scenario', '- **WHEN** 第一条件满足', '- **THEN** 第一结果成立', '', '#### Scenario: second scenario', '- **WHEN** 第二条件满足', '- **THEN** 第二结果成立', ''].join('\n');
    const omitted = ['## MODIFIED Requirements', '', '### Requirement: Preserve scenarios', '系统 MUST 只声明第一个场景。', '', '#### Scenario: first scenario', '- **WHEN** 第一条件满足', '- **THEN** 第一结果成立', ''].join('\n');
    canonical('preflight-omission', [preserved]);
    change('preflight-omission-change', 'preflight-omission', 'modified', omitted);
    const omission = preflight('preflight-omission-change', 2);
    if (omission.status !== 'blocked' || omission.blockers[0]?.category !== 'scenario-omission' || omission.blockers[0]?.omittedScenarioIdentities?.[0] !== 'second scenario') fail('preflight must classify Scenario omission');
    removeChange('preflight-omission-change');

    change('preflight-rename', 'demo', 'modified', '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Untouched`\n');
    const rename = preflight('preflight-rename', 2);
    if (rename.status !== 'blocked' || rename.blockers[0]?.category !== 'identity-conflict' || rename.blockers[0]?.code !== 'rename-not-unique') fail('preflight must classify rename identity conflicts');
  },
  'convergence-preflight-project-validation-blocker'() {
    change('preflight-validation', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    write(path.join(specsRoot, 'broken', 'spec.md'), '# broken Specification\n\n## Purpose\n\nMissing requirements on purpose.\n');
    const result = preflight('preflight-validation', 2);
    if (result.status !== 'blocked' || result.blockers[0]?.category !== 'projected-validation' || result.validation?.status !== 'blocked') fail('preflight must classify projected strict validation failures');
  },
  'convergence-transaction-safe'() {
    change('convergence-safe', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    const result = converge('convergence-safe');
    if (result.status !== 'passed' || result.disposition !== 'archived' || result.commandCount < 3) fail(`convergence safe result incomplete: ${JSON.stringify(result)}`);
    const canonicalContent = fs.readFileSync(path.join(specsRoot, 'demo', 'spec.md'), 'utf8');
    if (!canonicalContent.includes('Requirement: Added')) fail('convergence did not apply canonical result');
    const archived = fs.readdirSync(path.join(changesRoot, 'archive')).find((name) => name.endsWith('-convergence-safe'));
    if (!archived) fail('convergence did not archive Change');
    const receiptFile = path.join(changesRoot, 'archive', archived, '.buildr', 'convergence-receipt.json');
    if (fs.existsSync(receiptFile) || result.receipt !== null || result.receiptReleased !== true) fail('normal convergence must release its transaction receipt');
    const repeated = converge('convergence-safe');
    if (repeated.status !== 'passed' || repeated.commandCount !== 0) fail('archived convergence repeat must be idempotent');
    const terminal = inspect('convergence-safe');
    if (terminal.status !== 'not-applicable' || terminal.reason?.code !== 'convergence-terminal' || terminal.files.length !== 0) fail('archived convergence inspect must be terminal not-applicable');
  },
  'convergence-inspect-boundaries'() {
    change('inspect-state', 'demo', 'modified', `## ADDED Requirements\n\n${added}`);
    const notStarted = inspect('inspect-state');
    if (notStarted.status !== 'not-applicable' || notStarted.reason?.code !== 'convergence-not-started' || notStarted.files.length !== 0) fail('missing transaction receipt must be not-applicable');
    const fixture = writeTransactionReceipt('inspect-state', { type: 'ADDED', capability: 'demo', title: 'Added', requirement: added });
    const before = inspect('inspect-state');
    if (before.status !== 'passed' || before.disposition !== 'planned-not-applied' || before.files.some((item) => item.state !== 'before')) fail('before inspect must be recoverable');
    fs.writeFileSync(fixture.canonicalFile, fixture.plan.files[0].expectedContent);
    const expected = inspect('inspect-state');
    if (expected.status !== 'passed' || expected.disposition !== 'applied-and-matched' || expected.files.some((item) => item.state !== 'expected')) fail('expected inspect must be recoverable');
    fs.appendFileSync(fixture.canonicalFile, '\nmanual drift\n');
    const unknown = inspect('inspect-state', 2);
    if (unknown.status !== 'recovery-unprovable' || unknown.diagnostic?.code !== 'convergence-state-unknown' || !unknown.files.some((item) => item.state === 'unknown')) fail('unknown inspect must report per-file facts');
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
    'unsupported-upstream',
  ]),
  recovery: Object.freeze([
    'upstream-archive-safety',
    'convergence-preflight-ready-and-current',
    'convergence-preflight-semantic-blockers',
    'convergence-preflight-project-validation-blocker',
    'convergence-transaction-safe',
    'convergence-inspect-boundaries',
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
    const concurrency = resolveVerificationWorkerBudget({ env: process.env, fallback: 12, maximum: names.length, label: `OpenSpec ${selectedSuite} fixture suite` });
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
