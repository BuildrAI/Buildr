import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createSourceQuery } from '../../src/modules/agent-assets/application/source-query.ts';
import { createTaskMaterialsApplication } from '../../src/modules/task/materials/application/task-materials-application.ts';
import { createRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_QUERY } from '../../src/modules/workspace/module.ts';
import { TASK_BRIEF_QUERY } from '../../src/modules/task/module.ts';
import { AGENT_ASSETS_SOURCE_READ } from '../../src/modules/agent-assets/module.ts';
import { SOURCE_OBSERVATIONS_SCHEMA } from '../../src/modules/agent-assets/domain/source-observations.ts';

const isolated = process.env.BUILDR_SMOKE_ROOT; const namedRoot = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;
assert.ok(isolated && namedRoot && process.env.BUILDR_APP_DATA_DIR && process.env.BUILDR_PRODUCT_DATA_DIR, 'standard isolated runner required');
const initialized = spawnSync(process.execPath, [path.resolve('bin/buildr.mjs'), 'init', '--source-only', '--target', namedRoot, '--name', 'readonly-race', '--description', 'owned race fixture', '--profile', 'personal'], { env: process.env, encoding: 'utf8', timeout: 15000 });
assert.equal(initialized.status, 0, initialized.stderr);
const root = fs.realpathSync(namedRoot); const temporaryRoot = fs.realpathSync(isolated);
const outside = path.join(temporaryRoot, 'outside-fixture'); fs.mkdirSync(outside);
const secret = 'EXTERNAL_FIXTURE_BODY_NEVER_READ'; fs.writeFileSync(path.join(outside, 'policy.md'), secret);
const foreign = fs.statSync(path.join(outside, 'policy.md'));
function write(relative: string, content: string) { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
function snapshot(directory: string): Record<string, string> {
 const result: Record<string, string> = {};
 function walk(current: string, relative = '') {
  if (!fs.existsSync(current)) return;
  for (const name of fs.readdirSync(current)) { const file = path.join(current, name), member = relative ? `${relative}/${name}` : name; const stat = fs.lstatSync(file);
   if (stat.isSymbolicLink()) result[member] = `symlink:${fs.readlinkSync(file)}`;
   else if (stat.isDirectory()) walk(file, member);
   else result[member] = `${stat.size}:${stat.mtimeMs}:${fs.readFileSync(file).toString('base64')}`;
  }
 }
 walk(directory); return result;
}
write('rules/src/policy.md', 'Registered workspace policy');
write('rules/manifest.yml', 'schemaVersion: buildr.rules/v1\nrules:\n  - id: race-policy\n    source: workspace\n    path: rules/src/policy.md\n    description: isolated registered policy\n');
const materials = createTaskMaterialsApplication({ taskQuery: { assertCanonicalTaskWorkspace: () => root, readTask: () => ({ record: { changes: [] } }) }, projectQuery: { projectDetail: () => { throw Error('not a project body'); }, resolveSourceRoot: () => { throw Error('not a project root'); } }, worktreeQuery: { inspectGitWorktrees: () => { throw Error('not a worktree'); } } });
const runtime = createRuntime();
const query = createSourceQuery({ assets: runtimeProvide(runtime, AGENT_ASSETS_SOURCE_READ), workspace: runtimeProvide(runtime, WORKSPACE_QUERY), task: runtimeProvide(runtime, TASK_BRIEF_QUERY), materials });
const inspect = (observation: object) => query.inspect(root, { schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: [observation, { id: 'other-core', type: 'file', locator: { path: 'AGENTS.md' } }] });
const profiles = { app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) };
function race(directory: string, member: string, observation: object) {
 const originalOpen = fs.openSync; const originalRead = fs.readSync;
 let swapped = false, foreignReads = 0; let afterAttack: Record<string, string> | null = null;
 const source = path.resolve(root, directory); const retained = `${source}-retained`; const intended = path.resolve(root, directory, member);
 assert.ok(source.startsWith(root + path.sep) && retained.startsWith(root + path.sep) && intended.startsWith(source + path.sep));
 try {
  fs.openSync = ((file: fs.PathLike, flags: number | string, mode?: fs.Mode) => {
   if (!swapped && String(file) === intended) {
    // Exact checked targets are inside the runner's owned workspace; foreign target is its owned sibling fixture.
    fs.renameSync(source, retained); fs.symlinkSync(outside, source, 'dir'); swapped = true; afterAttack = snapshot(root);
   }
   return originalOpen(file, flags, mode);
  }) as typeof fs.openSync;
  fs.readSync = ((...args: Parameters<typeof fs.readSync>) => {
   try { const opened = fs.fstatSync(args[0]); if (opened.dev === foreign.dev && opened.ino === foreign.ino) foreignReads++; } catch { /* unrelated closed process pipe */ }
   return Reflect.apply(originalRead, fs, args);
  }) as typeof fs.readSync;
  const result = inspect(observation);
  assert.equal(swapped, true, 'race takes place after guards and before leaf open');
  assert.equal(foreignReads, 0, 'opened foreign inode is rejected before any body read');
  assert.equal(result.items[0].status, 'error'); assert.deepEqual(result.items[0].objects, []);
  assert.ok(!JSON.stringify(result).includes(secret) && !JSON.stringify(result).includes(outside));
  assert.equal(result.items[1].status, 'detected'); assert.deepEqual(result.effects, []);
  assert.deepEqual(snapshot(root), afterAttack, 'reader writes nothing after deliberate fixture attack');
  assert.deepEqual({ app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) }, profiles);
 } finally { fs.openSync = originalOpen; fs.readSync = originalRead; }
}
if (process.argv.includes('--root-only')) {
 // One new case: caller identity is confirmed before the strict helper's first root lstat.
 const otherNamed = path.join(temporaryRoot, 'unrelated-workspace');
 const prepared = spawnSync(process.execPath, [path.resolve('bin/buildr.mjs'), 'init', '--source-only', '--target', otherNamed, '--name', 'unrelated-root', '--description', 'independent root fixture', '--profile', 'personal'], { env: process.env, encoding: 'utf8', timeout: 15000 });
 assert.equal(prepared.status, 0, prepared.stderr);
 const otherRoot = fs.realpathSync(otherNamed);
 const outsideAgents = path.join(outside, 'AGENTS.md');
 fs.writeFileSync(outsideAgents, fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8') + '\nEXTERNAL_WHOLE_ROOT_BODY_NEVER_READ\n');
 const outsideStat = fs.statSync(outsideAgents);
 const baseWorkspace = runtimeProvide(runtime, WORKSPACE_QUERY);
 let confirmed = false, observedId: string | null = null, swapped = false, foreignReads = 0;
 const rootQuery = createSourceQuery({ assets: runtimeProvide(runtime, AGENT_ASSETS_SOURCE_READ), task: runtimeProvide(runtime, TASK_BRIEF_QUERY), materials, workspace: { ...baseWorkspace, getWorkspace(directory: string, options?: { requireRootProof?: boolean }) { const result = baseWorkspace.getWorkspace(directory, options); observedId = result.workspace.id; confirmed = true; return result; } } });
 const originalLstat = fs.lstatSync; const originalRead = fs.readSync;
 const preserved = `${root}-namespace-preserved`;
 assert.ok(root.startsWith(temporaryRoot + path.sep) && preserved.startsWith(temporaryRoot + path.sep) && outside.startsWith(temporaryRoot + path.sep));
 let afterAttack: Record<string, string> | null = null;
 const profileBefore = { app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) };
 try {
  fs.lstatSync = ((...args: Parameters<typeof fs.lstatSync>) => {
   if (confirmed && !swapped && String(args[0]) === root) {
    fs.renameSync(root, preserved); fs.symlinkSync(outside, root, 'dir'); swapped = true;
    afterAttack = snapshot(preserved); // Never walk the newly replaced root name into the outside fixture.
   }
   return Reflect.apply(originalLstat, fs, args);
  }) as typeof fs.lstatSync;
  fs.readSync = ((...args: Parameters<typeof fs.readSync>) => {
   try { const opened = fs.fstatSync(args[0]); if (opened.dev === outsideStat.dev && opened.ino === outsideStat.ino) foreignReads++; } catch { /* unrelated process pipe */ }
   return Reflect.apply(originalRead, fs, args);
  }) as typeof fs.readSync;
  const output = rootQuery.inspect(root, { schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: [{ id: 'confirmed-root-replaced', type: 'file', locator: { path: 'AGENTS.md' } }] });
  assert.equal(swapped, true); assert.equal(foreignReads, 0);
  assert.equal(output.workspace.id, observedId, 'no foreign root UUID is invented after the caller snapshot');
  assert.equal(output.items[0].status, 'error'); assert.deepEqual(output.items[0].objects, []);
  assert.ok(!JSON.stringify(output).includes('EXTERNAL_WHOLE_ROOT_BODY') && !JSON.stringify(output).includes(outside)); assert.deepEqual(output.effects, []);
  assert.deepEqual(snapshot(preserved), afterAttack);
  assert.deepEqual({ app: snapshot(process.env.BUILDR_APP_DATA_DIR!), product: snapshot(process.env.BUILDR_PRODUCT_DATA_DIR!) }, profileBefore);
 } finally { fs.lstatSync = originalLstat; fs.readSync = originalRead; }
 const otherBefore = snapshot(otherRoot);
 const unrelated = query.inspect(otherRoot, { schemaVersion: SOURCE_OBSERVATIONS_SCHEMA, observations: [{ id: 'independent-core', type: 'file', locator: { path: 'AGENTS.md' } }] });
 assert.equal(unrelated.items[0].status, 'detected'); assert.notEqual(unrelated.workspace.id, observedId); assert.deepEqual(unrelated.effects, []); assert.deepEqual(snapshot(otherRoot), otherBefore);
 console.log(JSON.stringify({ schemaVersion: 'buildr.source-readonly-root-race-smoke/v1', status: 'passed', case: 'confirmed-canonical-root-replaced-before-helper-lstat', foreignBodyReads: 0, retainedCallerIdentity: true, unrelatedRootDetected: true, profilesUnchanged: true, effects: [] }));
 process.exit(0);
}

race('rules/src', 'policy.md', { id: 'rule-parent-swap', type: 'file', locator: { path: 'rules/src/policy.md' } });
write('.buildr/local/task-materials/task/docs/policy.md', 'Selected task material');
write('.buildr/local/task-materials/task/materials.json', JSON.stringify({ schemaVersion: 'buildr.task-materials/v2', documents: [{ id: 'policy', role: 'solution', title: 'Policy', source: { kind: 'task', path: 'docs/policy.md' } }] }));
race('.buildr/local/task-materials/task/docs', 'policy.md', { id: 'task-parent-swap', type: 'task-material', taskId: 'task', materialId: 'policy' });
console.log(JSON.stringify({ schemaVersion: 'buildr.source-readonly-race-smoke/v1', status: 'passed', cases: ['registered-rule-parent-replace', 'selected-task-material-parent-replace'], foreignBodyReads: 0, otherCoreDetected: true, profilesUnchanged: true, effects: [] }));
