import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { nativeProgramPolicies } from '../../src/executors/program-policy.ts';
import { listConnectionProgramReferences } from '../../src/persistence/connection-relocation.ts';
import { programPackageCandidates, programPackageReferences, programPackageUnreferenced } from '../../src/storage/program-packages.ts';
import { removeStorageCandidate } from '../../src/storage/files.ts';

const unused = { complete: true, paths: [] as readonly string[] };
const day = 24 * 60 * 60_000;

function fixture(t: test.TestContext): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'program-packages-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'agent-service');
}
function packageFixture(root: string, provider: string, name: string, timestamp = Date.now() - 3 * day): string {
  const directory = path.join(root, 'programs', provider, name);
  fs.mkdirSync(path.join(directory, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), '{"name":"fixture"}');
  fs.writeFileSync(path.join(directory, 'node_modules/index.js'), 'module.exports=1;');
  for (const file of [path.join(directory, 'node_modules/index.js'), path.join(directory, 'package.json'), path.join(directory, 'node_modules'), directory]) fs.utimesSync(file, timestamp / 1000, timestamp / 1000);
  return directory;
}
function connections(root: string, records: Array<Record<string, unknown>>): void {
  fs.mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(path.join(root, 'conversations.sqlite'));
  try {
    db.exec('CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY, provider TEXT NOT NULL UNIQUE, revision TEXT NOT NULL, body TEXT NOT NULL)');
    db.exec('DELETE FROM connections');
    records.forEach((record, index) => db.prepare('INSERT OR REPLACE INTO connections(id,provider,revision,body) VALUES(?,?,?,?)').run((record.view as {id?:string}|undefined)?.id ?? 'c' + index, 'p' + index, 'r1', JSON.stringify(record)));
  } finally { db.close(); }
}
function upgrade(root: string, id: string, view: Record<string, unknown> | string): void {
  fs.mkdirSync(path.join(root, 'program-upgrades'), { recursive: true });
  fs.writeFileSync(path.join(root, 'program-upgrades', id + '.json'), typeof view === 'string' ? view : JSON.stringify(view));
}
const executable = (directory: string) => path.join(directory, 'node_modules/index.js');

test('connection bindings, binding data and program sources retain their exact packages', t => {
  const root = fixture(t);
  const bound = packageFixture(root, 'qoder', 'package-1.0.58-darwin-arm64');
  const source = packageFixture(root, 'qoder', 'package-1.0.57-darwin-arm64');
  const free = packageFixture(root, 'qoder', 'package-1.0.56-darwin-arm64');
  connections(root, [{ view: { executable: executable(bound) }, bindingData: { executable: executable(source) }, programSource: executable(source) }]);
  const references = programPackageReferences(root);
  assert.equal(references.complete, true);
  assert.ok(references.directories.has(bound));
  assert.ok(references.directories.has(source));
  assert.ok(!references.directories.has(free));
  assert.equal(programPackageUnreferenced(root, free), true);
  assert.equal(programPackageUnreferenced(root, bound), false);
});

test('a validated replacement keeps identity provenance without pinning the old package and its dependencies', t => {
  const root = fixture(t);
  const old = packageFixture(root, 'claude-code', 'package-2.1.322-darwin-arm64');
  const current = packageFixture(root, 'claude-code', 'package-2.1.323-darwin-arm64');
  const record = { view: { provider: 'claude-code', executable: executable(current) }, bindingIdentity: 'stable',
    bindingData: { format: 'buildr-native-binding/v2', provider: 'claude-code', executable: executable(old) }, programSource: executable(old) };
  connections(root, [record]);
  const cutoff = Date.now() - day;
  const item = programPackageCandidates(root, unused, cutoff).find(value => value.path === old)!;
  assert.equal(item.eligible, true);
  assert.equal(programPackageUnreferenced(root, current), false);
  connections(root, [{ ...record, bindingIdentity: undefined }]);
  assert.equal(programPackageUnreferenced(root, old), false, 'partial provenance still retains the package');
  connections(root, [record]);
  assert.equal(removeStorageCandidate(root, item, () => unused, () => programPackageUnreferenced(root, old)), true);
  assert.equal(fs.existsSync(executable(old)), false);
  assert.equal(fs.existsSync(executable(current)), true);
});

test('only a confirmed replacement bypasses the package stability window', t => {
  const root = fixture(t);
  const old = packageFixture(root, 'claude-code', 'package-2.1.322-darwin-arm64', Date.now());
  const current = packageFixture(root, 'claude-code', 'package-2.1.323-darwin-arm64', Date.now());
  const staging = packageFixture(root, 'claude-code', '.prepare-recent', Date.now());
  const cutoff = Date.now() - day;
  const job = { connectionId: 'claude-code', executable: executable(old), installedExecutable: executable(current) };
  const eligible = (directory: string, use = unused) => programPackageCandidates(root, use, cutoff).find(item => item.path === directory)?.eligible;
  upgrade(root, 'claude-code', { ...job, state: 'completed' });
  assert.equal(eligible(old), false);
  connections(root, [{ view: { id: 'claude-code', executable: executable(current) } }]);
  assert.equal(eligible(old), true);
  assert.equal(eligible(old, { complete: true, paths: [executable(old)] }), false);
  assert.equal(eligible(current), false);
  assert.equal(eligible(staging), false);
  for (const state of ['failed', 'interrupted', 'waiting', 'restarting']) {
    upgrade(root, 'claude-code', { ...job, state });
    assert.equal(eligible(old), false, state);
  }
});

test('unfinished upgrades retain rollback and target while completed history does not pin old packages', t => {
  const root = fixture(t);
  const old = packageFixture(root, 'qoder', 'package-1.0.58-darwin-arm64');
  const next = packageFixture(root, 'qoder', 'package-1.0.59-darwin-arm64');
  upgrade(root, 'qoder', { connectionId: 'qoder', id: 'u1', expectedVersion: '1.0.59', executable: executable(old), installedExecutable: executable(next), state: 'waiting', updatedAt: new Date().toISOString() });
  let references = programPackageReferences(root);
  assert.ok(references.directories.has(old) && references.directories.has(next));
  upgrade(root, 'qoder', { connectionId: 'qoder', id: 'u1', expectedVersion: '1.0.59', executable: executable(old), installedExecutable: executable(next), state: 'completed', updatedAt: new Date().toISOString() });
  references = programPackageReferences(root);
  assert.ok(!references.directories.has(old), 'completed pre-upgrade observation must not pin the old package');
  assert.ok(!references.directories.has(next), 'the committed binding, not history, protects the new package');
  for (const state of ['failed', 'interrupted', 'downloading', 'restarting']) {
    upgrade(root, 'qoder', { connectionId: 'qoder', id: 'u1', expectedVersion: '1.0.59', executable: executable(old), state, updatedAt: new Date().toISOString() });
    assert.ok(programPackageReferences(root).directories.has(old), state);
  }
});

test('unreadable upgrade records and connection bodies conservatively retain affected packages', t => {
  const root = fixture(t);
  const first = packageFixture(root, 'qoder', 'package-1.0.58-darwin-arm64');
  const second = packageFixture(root, 'qoder', 'package-1.0.59-darwin-arm64');
  const other = packageFixture(root, 'codex', 'package-0.166.0-darwin-arm64');
  upgrade(root, 'qoder', '{broken');
  let references = programPackageReferences(root);
  assert.equal(references.complete, true);
  assert.ok(references.directories.has(first) && references.directories.has(second));
  assert.ok(!references.directories.has(other));
  fs.mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(path.join(root, 'conversations.sqlite'));
  try {
    db.exec('CREATE TABLE connections(id TEXT PRIMARY KEY, provider TEXT NOT NULL UNIQUE, revision TEXT NOT NULL, body TEXT NOT NULL)');
    db.prepare('INSERT INTO connections(id,provider,revision,body) VALUES(?,?,?,?)').run('c1', 'qoder', 'r1', '{broken');
  } finally { db.close(); }
  references = programPackageReferences(root);
  assert.equal(references.complete, false);
  const items = programPackageCandidates(root, unused, Date.now() - day);
  assert.ok(items.every(item => !item.eligible));
  assert.ok(items.some(item => item.reason === 'program_references_unknown'));
});

test('current policy default destinations stay reusable for prepared programs', t => {
  const root = fixture(t);
  const defaults = Object.entries(nativeProgramPolicies).map(([provider, policy]) => packageFixture(root, provider, `${policy.version}-${process.platform}-${process.arch}`));
  const references = programPackageReferences(root);
  for (const directory of defaults) assert.ok(references.directories.has(directory), directory);
  const items = programPackageCandidates(root, unused, Date.now() - day);
  assert.ok(items.filter(item => defaults.includes(item.path)).every(item => !item.eligible && item.reason === 'program_package_referenced'));
});

test('the newest registry-version package stays reusable before a connection binds it', t => {
  const root = fixture(t);
  const older = packageFixture(root, 'codex', 'package-0.166.0-darwin-arm64', Date.now() - 3 * day);
  const newest = packageFixture(root, 'codex', 'package-0.167.0-darwin-arm64', Date.now() - 2 * day);
  fs.writeFileSync(path.join(root, 'programs', 'codex', 'prepared.json'), JSON.stringify({ version: '0.167.0', executable: executable(newest) }));
  const references = programPackageReferences(root);
  assert.ok(references.directories.has(newest));
  const items = programPackageCandidates(root, unused, Date.now() - day);
  assert.equal(items.find(item => item.path === newest)?.eligible, false);
  assert.equal(items.find(item => item.path === older)?.eligible, true);
});

test('candidates require a stable window, no occupancy and no references; staging leftovers qualify', t => {
  const root = fixture(t);
  const old = packageFixture(root, 'qoder', 'package-1.0.58-darwin-arm64');
  const recent = packageFixture(root, 'qoder', 'package-1.0.59-darwin-arm64', Date.now());
  const busy = packageFixture(root, 'codex', 'package-0.166.0-darwin-arm64');
  const staging = packageFixture(root, 'dsh', '.prepare-abc123');
  const cutoff = Date.now() - day;
  const items = programPackageCandidates(root, { complete: true, paths: [executable(busy)] }, cutoff);
  const byPath = new Map(items.map(item => [item.path, item]));
  assert.equal(byPath.get(old)!.eligible, true);
  assert.equal(byPath.get(old)!.kind, 'program-package');
  assert.equal(byPath.get(recent)!.eligible, false);
  assert.equal(byPath.get(recent)!.reason, 'storage_recent');
  assert.equal(byPath.get(busy)!.eligible, false);
  assert.equal(byPath.get(busy)!.reason, 'storage_in_use');
  assert.equal(byPath.get(staging)!.eligible, true);
  assert.ok(programPackageCandidates(root, { complete: false, paths: [] }, cutoff).every(item => !item.eligible));
});

test('conditional removal rechecks references and identity after the preview', t => {
  const root = fixture(t);
  const directory = packageFixture(root, 'qoder', 'package-1.0.58-darwin-arm64');
  const cutoff = Date.now() - day;
  const item = programPackageCandidates(root, unused, cutoff).find(value => value.path === directory)!;
  assert.equal(item.eligible, true);
  connections(root, [{ view: { executable: executable(directory) } }]);
  assert.equal(removeStorageCandidate(root, item, () => unused, () => programPackageUnreferenced(root, directory)), false, 'a binding added after the preview retains the package');
  assert.ok(fs.existsSync(directory));
  connections(root, []);
  assert.equal(removeStorageCandidate(root, item, () => unused, () => programPackageUnreferenced(root, directory)), true);
  assert.ok(!fs.existsSync(directory));
});

test('content changes after the preview retain the package', t => {
  const root = fixture(t);
  const directory = packageFixture(root, 'qoder', 'package-1.0.58-darwin-arm64');
  const item = programPackageCandidates(root, unused, Date.now() - day).find(value => value.path === directory)!;
  fs.writeFileSync(path.join(directory, 'node_modules/extra.js'), 'changed');
  assert.equal(removeStorageCandidate(root, item, () => unused, () => programPackageUnreferenced(root, directory)), false);
  assert.ok(fs.existsSync(directory));
});

test('reference observation reports missing databases as complete and unreadable ones as incomplete', t => {
  const root = fixture(t);
  assert.deepEqual(listConnectionProgramReferences(path.join(root, 'conversations.sqlite')), { complete: true, paths: [], bound: new Map() });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'conversations.sqlite'), 'not a database');
  assert.equal(listConnectionProgramReferences(path.join(root, 'conversations.sqlite')).complete, false);
});
