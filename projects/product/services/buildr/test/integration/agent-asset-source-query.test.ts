import { boundSourceResult } from '../../src/modules/agent-assets/domain/source-observations.ts';
import { createTaskMaterialsApplication } from '../../src/modules/task/materials/application/task-materials-application.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSourceQuery } from '../../src/modules/agent-assets/application/source-query.ts';
import { SOURCE_OBSERVATIONS_SCHEMA } from '../../src/modules/agent-assets/application/source-observations.ts';
import { sourceDigest } from '../../src/modules/agent-assets/persistence/source-object-repository.ts';
import { buildSkillProjectionReceipt, renderSkillProjectionReceipt } from '../../src/modules/agent-assets/infrastructure/runtime/skills/projection-files.ts';
const uuid = 'f2f40b71-2382-5906-82bd-76a7927b59f3';
const required = '<!-- buildr:required begin -->\n# Buildr\nRule body\n<!-- buildr:required end -->';
function fixture(t: { after(fn: () => void): void }) {
 const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-source-query-')));
 t.after(() => { assert.ok(root.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)); fs.rmSync(root, { recursive: true }); });
 fs.mkdirSync(path.join(root, '.buildr'), { recursive: true }); fs.writeFileSync(path.join(root, '.buildr/workspace.yml'), 'workspace: fixture\n');
 const skills = [{ id: 'review', path: 'buildr/review', assetIdentity: 'buildr:skill:review', sourceIdentity: 'package:skills/buildr/review', source: 'buildr', enabled: true }];
 let materialReads = 0;
 const query = createSourceQuery({ assets: { readSkills: () => skills, readRules: () => [{ id: 'team', path: 'rules/team.md', source: 'workspace' }], readContracts: () => [], requiredBlock: () => required }, workspace: { resolveSourceWorkspaceRoot: () => root, getWorkspace: () => ({ workspace: { id: uuid }, rootPath: root }), readProjectRegistryRecord: () => ({ projects: {} }) }, task: { readTaskBrief: () => { materialReads++; assert.fail('source observations must not read user briefs'); } }, materials: { inspectTaskMaterial: () => { materialReads++; assert.fail('source observations must not read user materials'); } } });
 const write = (relative: string, content: string) => { const p = path.join(root, relative); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
 const inspect = (observations: unknown[], options = {}) => query.inspect(root, { schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations }, options);
 return { root, write, inspect, skills, query, materialReads: () => materialReads };
}
test('only exact managed block is Buildr; suffix is mixed; missing observed version stays unknown', t => {
 const f = fixture(t), content = `# AGENTS.md\n\n${required}\n\nWorkspace suffix\n`; f.write('AGENTS.md', content);
 const result = f.inspect([{ id: 'rule', type: 'file', locator: { path: 'AGENTS.md' }, observedContent: content }, { id: 'current', type: 'file', locator: { path: 'AGENTS.md' } }]);
 assert.equal(result.items[0].status, 'detected'); assert.equal(result.items[0].mixed, true);
 const o = result.items[0].objects[0]; assert.equal(o.current?.content, required); assert.equal(content.slice(o.selection!.startOffset, o.selection!.endOffset), required); assert.equal(o.historical, 'matched-current');
 assert.equal(result.items[1].objects[0].historical, 'unknown'); assert.deepEqual(result.effects, []);
 f.write('AGENTS.md', required.replace('Rule body', 'tampered')); assert.equal(f.inspect([{ id: 'bad', type: 'file', locator: { path: 'AGENTS.md' } }]).items[0].status, 'conflict');
});
test('metadata capture keeps actual version proof and fragment selection without a second body copy', t => {
 const f = fixture(t), content = `# AGENTS.md\n\n${required}\n\nPRIVATE USER SUFFIX\n`; f.write('AGENTS.md', content);
 const observations = [{ id: 'rule', type: 'file', locator: { path: 'AGENTS.md' }, observedDigest: sourceDigest(content) }];
 const input = { schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations };
 const original = f.query.inspect(f.root, input);
 const metadata = f.query.inspect(f.root, { ...input, mode: 'metadata' });
 assert.ok(original.items[0].objects[0].current?.content);
 const object = metadata.items[0].objects[0];
 assert.equal(object.historical, 'matched-current'); assert.equal(object.current, null);
 assert.deepEqual(object.observed, { digest: sourceDigest(required) });
 assert.equal(content.slice(object.selection!.startOffset, object.selection!.endOffset), required);
 assert.equal(JSON.stringify(metadata).includes('Rule body'), false);
 assert.equal(JSON.stringify(metadata).includes('PRIVATE USER'), false);
 f.write('AGENTS.md', content + 'changed');
 assert.notEqual(f.query.inspect(f.root, { ...input, mode: 'metadata' }).items[0].objects[0].historical, 'matched-current');
 assert.equal(f.materialReads(), 0);
});
test('ordinary product files and outside same-name skill never prove Buildr', t => {
 const f = fixture(t); f.write('projects/product/src/buildr.ts', 'Buildr code'); f.write('.agents/skills/other/SKILL.md', 'name: review');
 const r = f.inspect([{ id: 'source', type: 'file', locator: { path: 'projects/product/src/buildr.ts' } }, { id: 'other', type: 'skill', locator: { path: '.agents/skills/other/SKILL.md' } }]); assert.deepEqual(r.items.map(i => i.status), ['unknown', 'unknown']);
});
test('exact projection receipt plus scope and observed full digest identifies skill; tampering conflicts', t => {
 const f = fixture(t), body = '# Review\n'; f.write('.agents/skills/review/SKILL.md', body);
 const receipt = buildSkillProjectionReceipt({ adapterId: 'agents-standard', destination: 'workspace', skillId: 'review', runtimePath: 'review', sources: ['.'], assetIdentity: f.skills[0].assetIdentity, sourceIdentity: f.skills[0].sourceIdentity, sourceWorkspaceId: uuid, sourceDigest: sourceDigest('source'), renderDigest: sourceDigest('render'), files: [{ path: 'SKILL.md', integrity: sourceDigest(body), executable: false }] });
 f.write('.buildr/agent-runtime/workspace/agents-standard/skill-projection-ownership-receipts/review.json', renderSkillProjectionReceipt(receipt));
 const base = { type: 'skill', locator: { path: '.agents/skills/review/SKILL.md', resourceBase: '.agents/skills/review' } };
 const r = f.inspect([{ id: 'exact', ...base, observedContent: body }, { id: 'history', ...base, observedDigest: sourceDigest('old') }, { id: 'scope', ...base, locator: { ...base.locator, resourceBase: '.agents/skills/other' } }]);
 assert.equal(r.items[0].status, 'detected'); assert.equal(r.items[0].objects[0].identity, f.skills[0].assetIdentity); assert.equal(r.items[0].objects[0].managedBy, 'buildr'); assert.equal(r.items[1].status, 'conflict'); assert.equal(r.items[2].status, 'conflict');
 f.write('.agents/skills/review/SKILL.md', 'tampered'); assert.equal(f.inspect([{ id: 'bad', ...base }]).items[0].status, 'conflict');
});
test('secret, path escape and symbolic link fail locally without exposing content', t => {
 const f = fixture(t); f.write('.env', 'SECRET=private'); f.write('rules/team.md', 'workspace rule'); fs.symlinkSync(path.join(f.root, 'rules/team.md'), path.join(f.root, 'link.md'));
 const r = f.inspect([{ id: 'secret', type: 'file', locator: { path: '.env' } }, { id: 'escape', type: 'file', locator: { path: '../outside' } }, { id: 'link', type: 'file', locator: { path: 'link.md' } }, { id: 'valid', type: 'file', locator: { path: 'rules/team.md' } }]);
 assert.deepEqual(r.items.map(i => i.status), ['error', 'error', 'error', 'detected']); assert.ok(!JSON.stringify(r).includes('SECRET')); assert.equal(r.items[3].objects[0].providedBy, 'workspace');
});
test('malformed observations, observation conflict, bounds and cancellation remain local', t => {
 const f = fixture(t); f.write('AGENTS.md', required);
 const r = f.inspect([{ id: 'malformed', type: 'file', unexpected: true }, { id: 'conflict', type: 'file', locator: { path: 'AGENTS.md' }, observedContent: required, observedDigest: sourceDigest('other') }, { id: 'brief', type: 'task-brief', taskId: 'task' }]);
 assert.deepEqual(r.items.map(i => i.status), ['error', 'conflict', 'unknown']); assert.equal(r.items[2].diagnostic?.code, 'source_user_material_excluded');
 assert.throws(() => f.inspect(Array(33).fill({}))); const controller = new AbortController(); controller.abort(); assert.equal(f.inspect([{ id: 'cancel', type: 'file' }], { signal: controller.signal }).items[0].diagnostic?.code, 'source_cancelled');
});

test('registered source identity survives version change without inventing history; oversized text is local', t => {
 const f = fixture(t); const old = '# old skill'; f.write('skills/buildr/review/SKILL.md', '# current skill');
 const first = f.inspect([{ id: 'old', type: 'skill', locator: { path: 'skills/buildr/review/SKILL.md' }, observedContent: old }]);
 assert.equal(first.items[0].status, 'detected'); assert.equal(first.items[0].objects[0].historical, 'different'); assert.equal(first.items[0].objects[0].observed.content, old);
 const identity = first.items[0].objects[0].identity;
 f.write('skills/buildr/review/SKILL.md', '# changed again'); assert.equal(f.inspect([{ id: 'same', type: 'skill', locator: { path: 'skills/buildr/review/SKILL.md' } }]).items[0].objects[0].identity, identity);
 f.write('AGENTS.md', required); f.write('skills/buildr/review/SKILL.md', 'x'.repeat(512 * 1024 + 1)); const result = f.inspect([{ id: 'too-large', type: 'skill', locator: { path: 'skills/buildr/review/SKILL.md' } }, { id: 'rule', type: 'file', locator: { path: 'AGENTS.md' } }]);
 assert.deepEqual(result.items.map(i => i.status), ['error', 'detected']);
});
test('receipt damage is confined and never repaired; unknown current source is not DSH', t => {
 const f = fixture(t); f.write('.agents/skills/review/SKILL.md', 'body'); const file = '.buildr/agent-runtime/workspace/agents-standard/skill-projection-ownership-receipts/review.json'; f.write(file, '{}');
 const r = f.inspect([{ id: 'bad', type: 'skill', locator: { path: '.agents/skills/review/SKILL.md' } }, { id: 'unknown', type: 'file', locator: { path: 'unknown.md' } }]);
 assert.deepEqual(r.items.map(i => i.status), ['error', 'unknown']); assert.equal(r.items[1].objects.length, 0); assert.equal(fs.readFileSync(path.join(f.root, file), 'utf8'), '{}');
});
test('duplicate ids and timeout are local errors', t => {
 const f = fixture(t); const r = f.inspect([{ id: 'duplicate', type: 'file' }, { id: 'duplicate', type: 'file' }]); assert.equal(r.items[0].status, 'unknown'); assert.equal(r.items[1].status, 'error');
 assert.equal(f.inspect([{ id: 'late', type: 'file' }], { timeoutMs: -1 }).items[0].diagnostic?.code, 'source_timeout');
});

test('complete output boundary includes wrappers, newline and multibyte text', t => {
 const f = fixture(t); f.write('skills/buildr/review/SKILL.md', '你好'.repeat(80)); const result = f.inspect([{ id: '你好', type: 'skill', locator: { path: 'skills/buildr/review/SKILL.md' } }]);
 const exact = Buffer.byteLength(JSON.stringify(result)) + 1;
 assert.deepEqual(boundSourceResult(result, exact), result);
 const limited = boundSourceResult(result, exact - 1);
 assert.ok(Buffer.byteLength(JSON.stringify(limited)) + 1 <= exact - 1);
 assert.equal(limited.items[0].diagnostic?.code, 'source_output_limit');
 assert.throws(() => boundSourceResult(result, 1), /包装/);
});
test('source observations exclude task briefs and materials without calling their ordinary public readers', t => {
 const f = fixture(t); f.write('AGENTS.md', required);
 const result = f.inspect([
  { id: 'brief', type: 'task-brief', taskId: 'task', observedContent: 'PRIVATE BRIEF' },
  { id: 'material', type: 'task-material', taskId: 'task', materialId: 'material', observedContent: 'PRIVATE MATERIAL' },
  { id: 'rule', type: 'file', locator: { path: 'AGENTS.md' } },
 ]);
 assert.deepEqual(result.items.map(item => item.status), ['unknown', 'unknown', 'detected']);
 assert.ok(result.items.slice(0, 2).every(item => item.objects.length === 0 && item.diagnostic?.code === 'source_user_material_excluded'));
 assert.equal(f.materialReads(), 0);
 assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
test('skill member object keys are distinct and stable when contents change', t => {
 const f = fixture(t); f.write('skills/buildr/review/SKILL.md', 'main'); f.write('skills/buildr/review/references/rule.md', 'rule');
 const observed = [{ id: 'main', type: 'file', locator: { path: 'skills/buildr/review/SKILL.md' } }, { id: 'member', type: 'file', locator: { path: 'skills/buildr/review/references/rule.md' } }];
 const first = f.inspect(observed); assert.notEqual(first.items[0].objects[0].identity, first.items[1].objects[0].identity);
 assert.equal(first.items[1].objects[0].selector.assetIdentity, f.skills[0].assetIdentity);
 f.write('skills/buildr/review/references/rule.md', 'changed'); assert.equal(f.inspect(observed).items[1].objects[0].identity, first.items[1].objects[0].identity);
});

test('public single-material reader loads no sibling body and rejects secret selected paths', t => {
 const f = fixture(t); const base = '.buildr/local/task-materials/task';
 f.write(`${base}/safe.md`, 'safe selected'); f.write(`${base}/.env.md`, 'SECRET SIBLING');
 f.write(`${base}/materials.json`, JSON.stringify({ schemaVersion: 'buildr.task-materials/v2', documents: [{ id: 'safe', role: 'solution', title: 'Safe', source: { kind: 'task', path: 'safe.md' } }, { id: 'secret', role: 'solution', title: 'Secret', source: { kind: 'task', path: '.env.md' } }] }));
 const application = createTaskMaterialsApplication({ taskQuery: { assertCanonicalTaskWorkspace: () => f.root, readTask: () => ({ record: { changes: [] } }) }, projectQuery: { projectDetail: () => { throw Error('must not read any project body'); }, resolveSourceRoot: () => { throw Error('must not resolve any project root'); } }, worktreeQuery: { inspectGitWorktrees: () => { throw Error('must not inspect worktree'); } } });
 assert.equal(application.inspectTaskMaterial(f.root, 'task', 'safe')?.content, 'safe selected');
 assert.throws(() => application.inspectTaskMaterial(f.root, 'task', 'secret'), /秘密/);
 assert.equal(application.inspectTaskMaterial(f.root, 'task', 'missing'), null);
});
