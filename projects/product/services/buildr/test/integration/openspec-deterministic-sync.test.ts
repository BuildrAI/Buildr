import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { applyDeterministicSyncPlan, createDeterministicSyncPlan, parseCanonicalSpec } from '../../src/task/openspec/application/deterministic-sync.ts';

const requirement: any = (name: any, statement: any = 'System MUST work.') => `### Requirement: ${name}\n${statement}\n\n#### Scenario: works\n- **WHEN** invoked\n- **THEN** it MUST pass\n`;
const delta: any = (operations: any) => ({ hash: 'sha256-delta', operations });

function fixture(): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-deterministic-sync-'));
  fs.mkdirSync(path.join(root, 'openspec', 'specs', 'sample'), { recursive: true });
  return root;
}

test('parser保留Requirement结构并暴露重复identity', () => {
  const parsed: any = parseCanonicalSpec(`# sample Specification\n\n${requirement('One')}\n${requirement('One', 'Other MUST work.')}`);
  assert.equal(parsed.blocks.length, 2);
  assert.equal(parsed.identities.get('One').length, 2);
});

test('完整ADDED生成identity-bound plan并原子应用', (t: any) => {
  const projectRoot: any = fixture();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const file: any = path.join(projectRoot, 'openspec', 'specs', 'sample', 'spec.md');
  fs.writeFileSync(file, '# sample Specification\n\n## Purpose\n\nSample.\n');
  const plan: any = createDeterministicSyncPlan({ change: 'change', project: 'product', projectRoot, delta: delta([{ type: 'ADDED', capability: 'sample', title: 'One', requirement: requirement('One') }]), baseline: { targets: [{ capability: 'sample', title: 'One', operation: 'ADDED', state: 'absent', content: null }] } });
  assert.equal(plan.status, 'safe');
  const result: any = applyDeterministicSyncPlan({ projectRoot, plan });
  assert.equal(result.status, 'passed');
  const applied: any = fs.readFileSync(file, 'utf8');
  assert.match(applied, /Requirement: One/);
  assert.equal(applied.endsWith('\n'), true);
});

test('重复identity或冲突ADDED整批blocked且零写入', (t: any) => {
  const projectRoot: any = fixture();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const file: any = path.join(projectRoot, 'openspec', 'specs', 'sample', 'spec.md');
  const before: any = `# sample Specification\n\n${requirement('One')}`;
  fs.writeFileSync(file, before);
  const plan: any = createDeterministicSyncPlan({ change: 'change', project: 'product', projectRoot, delta: delta([{ type: 'ADDED', capability: 'sample', title: 'One', requirement: requirement('One', 'Different MUST work.') }]), baseline: { targets: [] } });
  assert.equal(plan.status, 'blocked');
  assert.equal(applyDeterministicSyncPlan({ projectRoot, plan }).status, 'blocked');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('新capability必须从proposal取得唯一Purpose', (t: any) => {
  const projectRoot: any = fixture();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const capability: any = 'new-capability';
  const input: any = { change: 'change', project: 'product', projectRoot, delta: delta([{ type: 'ADDED', capability, title: 'One', requirement: requirement('One') }]), baseline: { targets: [] } };
  const blocked: any = createDeterministicSyncPlan(input);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.blocked[0].operation, 'CREATE_CAPABILITY');
  const short: any = createDeterministicSyncPlan({ ...input, capabilityPurposes: new Map([[capability, 'Defines one capability.']]) });
  assert.equal(short.status, 'blocked');
  const purpose: any = 'Defines deterministic planning and atomic application while preserving identity-bound evidence and semantic fallback behavior.';
  const safe: any = createDeterministicSyncPlan({ ...input, capabilityPurposes: new Map([[capability, purpose]]) });
  assert.equal(safe.status, 'safe');
  assert.match(safe.files[0].expected, new RegExp(`## Purpose\\n\\n${purpose.replace('.', '\\.')}\\n\\n## Requirements\\n\\n### Requirement:`));
});

test('plan后canonical漂移返回receipt-stale且不写入', (t: any) => {
  const projectRoot: any = fixture();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const file: any = path.join(projectRoot, 'openspec', 'specs', 'sample', 'spec.md');
  fs.writeFileSync(file, '# sample Specification\n');
  const plan: any = createDeterministicSyncPlan({ change: 'change', project: 'product', projectRoot, delta: delta([{ type: 'ADDED', capability: 'sample', title: 'One', requirement: requirement('One') }]), baseline: { targets: [] } });
  fs.writeFileSync(file, '# sample Specification\n\nDrift.\n');
  assert.equal(applyDeterministicSyncPlan({ projectRoot, plan }).status, 'receipt-stale');
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Requirement: One/);
});

test('MODIFIED省略baseline Scenario时要求语义处理', (t: any) => {
  const projectRoot: any = fixture();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const file: any = path.join(projectRoot, 'openspec', 'specs', 'sample', 'spec.md');
  const original: any = `${requirement('One')}\n#### Scenario: retained\n- **WHEN** retained\n- **THEN** it MUST remain\n`;
  fs.writeFileSync(file, `# sample Specification\n\n${original}`);
  const plan: any = createDeterministicSyncPlan({ change: 'change', project: 'product', projectRoot, delta: delta([{ type: 'MODIFIED', capability: 'sample', title: 'One', requirement: requirement('One', 'Changed MUST work.') }]), baseline: { targets: [{ capability: 'sample', title: 'One', state: 'present', content: original }] } });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.blocked[0].code, 'semantic-resolution-required');
  assert.equal(plan.blocked[0].reason, 'scenario-identities-omitted');
  assert.deepEqual(plan.blocked[0].omittedScenarioIdentities, ['retained']);
});

test('所有temporary准备完成前失败不会写canonical', (t: any) => {
  const projectRoot: any = fixture();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const file: any = path.join(projectRoot, 'openspec', 'specs', 'sample', 'spec.md');
  fs.writeFileSync(file, '# sample Specification\n');
  const plan: any = createDeterministicSyncPlan({ change: 'change', project: 'product', projectRoot, delta: delta([{ type: 'ADDED', capability: 'sample', title: 'One', requirement: requirement('One') }]), baseline: { targets: [] } });
  const io: any = { ...fs, writeFileSync(target: any, content: any): any  { if (String(target).includes('.buildr-sync-')) throw new Error('injected'); return fs.writeFileSync(target, content); } };
  assert.throws(() => applyDeterministicSyncPlan({ projectRoot, plan, io }), /injected/);
  assert.equal(fs.readFileSync(file, 'utf8'), '# sample Specification\n');
});

test('expected Project strict validation失败时整批零写入', (t: any) => {
  const projectRoot: any = fixture();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const file: any = path.join(projectRoot, 'openspec', 'specs', 'sample', 'spec.md');
  const before: any = '# sample Specification\n';
  fs.writeFileSync(file, before);
  const plan: any = createDeterministicSyncPlan({ change: 'change', project: 'product', projectRoot, delta: delta([{ type: 'ADDED', capability: 'sample', title: 'One', requirement: requirement('One') }]), baseline: { targets: [] } });
  let observed: any;
  const result: any = applyDeterministicSyncPlan({ projectRoot, plan, validateExpected(input: any): any  { observed = input; return { status: 'blocked', code: 'strict' }; } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocked[0].code, 'expected-tree-invalid');
  assert.equal(observed.files[0].digest, plan.files[0].expectedDigest);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('expected Project合法骨架通过后记录validator identity与完整digests', (t: any) => {
  const projectRoot: any = fixture();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const file: any = path.join(projectRoot, 'openspec', 'specs', 'sample', 'spec.md');
  fs.writeFileSync(file, '# sample Specification\n\n## Purpose\n\nSample capability purpose with sufficient authority for strict validation behavior.\n\n## Requirements\n');
  const plan: any = createDeterministicSyncPlan({ change: 'change', project: 'product', projectRoot, delta: delta([{ type: 'ADDED', capability: 'sample', title: 'One', requirement: requirement('One') }]), baseline: { targets: [] } });
  const result: any = applyDeterministicSyncPlan({ projectRoot, plan, validateExpected: ({ files }: any) => ({ status: 'passed', executable: '/fixture/openspec', version: '1.6.0', expectedDigests: Object.fromEntries(files.map((item: any) => [item.path, item.digest])) }) });
  assert.equal(result.status, 'passed');
  assert.equal(result.validation.executable, '/fixture/openspec');
  assert.deepEqual(result.validation.expectedDigests, Object.fromEntries(plan.files.map((item: any) => [item.path, item.expectedDigest])));
});

test('expected validator拒绝缺少Requirements或不完整Purpose且canonical不变', (t: any) => {
  const projectRoot: any = fixture();
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const file: any = path.join(projectRoot, 'openspec', 'specs', 'sample', 'spec.md');
  const before: any = '# sample Specification\n';
  fs.writeFileSync(file, before);
  const plan: any = createDeterministicSyncPlan({ change: 'change', project: 'product', projectRoot, delta: delta([{ type: 'ADDED', capability: 'sample', title: 'One', requirement: requirement('One') }]), baseline: { targets: [] } });
  for (const code of ['missing-requirements', 'purpose-incomplete']) {
    const result: any = applyDeterministicSyncPlan({ projectRoot, plan, validateExpected: () => ({ status: 'blocked', code }) });
    assert.equal(result.status, 'blocked');
    assert.equal(result.validation.code, code);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
});
