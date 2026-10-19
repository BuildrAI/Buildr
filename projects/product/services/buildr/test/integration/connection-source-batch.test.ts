import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBoundedBuildrWebReadExecutor } from '../../src/web/http/read-executor.ts';
import { ConnectionDirectoryReads } from '../../src/modules/connection-skills/application/directory-reads.ts';
import YAML from 'yaml';
import { readConnectionSkillFile, readConnectionSkillFiles, readConnectionSkillSources } from '../../src/modules/agent-assets/application/connection-skill-source.ts';
import { readSkillTexts } from '../../src/modules/agent-assets/persistence/skill-content-repository.ts';
import { createConnectionCatalog, type ConnectionSkillSource } from '../../src/modules/connection-skills/application/catalog.ts';

function fixture(t: { after(fn: () => void): void }, count = 4) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-source-batch-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skills: ConnectionSkillSource[] = Array.from({ length: count }, (_, index) => ({ id: `example-${index}`, assetIdentity: `fixture:example-${index}`, sourceIdentity: `fixture:source-${index}`, path: `connections/example-${index}`, connectionDefinitions: ['assets/connection.yml'] }));
  for (const skill of skills) {
    const directory = path.join(root, 'skills', skill.path!); fs.mkdirSync(path.join(directory, 'assets'), { recursive: true }); fs.mkdirSync(path.join(directory, 'scripts'));
    fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${skill.id}\ndescription: fixture\n---\n`);
    fs.writeFileSync(path.join(directory, 'scripts/client.mjs'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(directory, 'assets/connection.yml'), YAML.stringify({ schemaVersion: 'buildr.connection-definition/v1', definitionId: skill.id, name: skill.id, description: '离线来源夹具', category: 'fixture', configVersion: 1, config: { fields: [] }, authentication: { fields: [], targetFields: [] }, programs: { cli: { kind: 'bundled', runtime: 'node', entry: 'scripts/client.mjs' } } }));
  }
  const writeManifest = () => fs.writeFileSync(path.join(root, 'skills/manifest.yml'), YAML.stringify({ schemaVersion: 'buildr.skills/v3', workspaceId: crypto.randomUUID(), skills })); writeManifest();
  return { root, skills, writeManifest };
}

test('four real sources use three proof phases and keep legacy catalog results', t => {
  const f = fixture(t), original = childProcess.execFileSync; let probes = 0;
  const capture = t.mock.method(childProcess, 'execFileSync', (...args: Parameters<typeof childProcess.execFileSync>) => { if (args[0] === '/usr/sbin/lsof') probes++; return original(...args); }); syncBuiltinESMExports();
  try {
    const batched = createConnectionCatalog({ assets: { readSkills: readConnectionSkillSources, readSkillFile: readConnectionSkillFile, readSkillFiles: readConnectionSkillFiles } }).list(f.root);
    assert.equal(batched.definitions.length, 4); assert.deepEqual(batched.diagnostics, []);
    assert.equal(probes, process.platform === 'darwin' ? 6 : 0, 'manifest, valid entries and declarations each use one before/after proof');
    probes = 0;
    const legacy = createConnectionCatalog({ assets: { readSkills: readConnectionSkillSources, readSkillFile: readConnectionSkillFile } }).list(f.root);
    assert.deepEqual(legacy, batched, 'optional batch support preserves single-file providers');
    assert.equal(probes, process.platform === 'darwin' ? 18 : 0);
  } finally { capture.mock.restore(); syncBuiltinESMExports(); }
});

test('invalid entries never read attachments and individual declaration defects remain local', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'skills', f.skills[0]!.path!, 'SKILL.md'), '---\nname: wrong-name\ndescription: fixture\n---\n');
  fs.unlinkSync(path.join(f.root, 'skills', f.skills[1]!.path!, 'SKILL.md'));
  fs.writeFileSync(path.join(f.root, 'skills', f.skills[2]!.path!, 'assets/connection.yml'), 'invalid declaration');
  const batches: Array<Array<{ skillPath: string; relative: string }>> = [];
  const catalog = createConnectionCatalog({ assets: {
    readSkills: readConnectionSkillSources,
    readSkillFile: () => { throw new Error('Batched provider must not reopen individually'); },
    readSkillFiles: (root, requests) => { batches.push([...requests]); return readConnectionSkillFiles(root, requests); },
  } });
  const result = catalog.list(f.root);
  assert.deepEqual(result.definitions.map(entry => entry.skill.id), ['example-3']);
  assert.deepEqual(result.diagnostics.map(item => item.code), ['connection_skill_entry_invalid', 'connection_skill_entry_invalid', 'connection_definition_invalid']);
  assert.deepEqual(batches.map(batch => batch.map(item => `${item.skillPath}/${item.relative}`)), [f.skills.map(skill => `${skill.path}/SKILL.md`), f.skills.slice(2).map(skill => `${skill.path}/assets/connection.yml`)]);
});

test('source batches retain text restrictions and per-item positions', t => {
  const f = fixture(t, 1), skillPath = f.skills[0]!.path!, directory = path.join(f.root, 'skills', skillPath);
  fs.writeFileSync(path.join(directory, 'assets/invalid.txt'), Buffer.from([0xff]));
  fs.writeFileSync(path.join(directory, 'assets/nul.txt'), Buffer.from([0]));
  fs.writeFileSync(path.join(directory, 'assets/large.txt'), Buffer.alloc(512 * 1024 + 1));
  fs.writeFileSync(path.join(directory, 'assets/image.png'), 'unsupported');
  fs.symlinkSync(path.join(directory, 'assets/connection.yml'), path.join(directory, 'assets/link.yml'));
  const relatives = ['assets/connection.yml', 'assets/missing.yml', 'assets/invalid.txt', 'assets/nul.txt', 'assets/large.txt', 'assets/image.png', 'assets/link.yml', '../outside.txt', 'SKILL.md'];
  const results = readConnectionSkillFiles(f.root, relatives.map(relative => ({ skillPath, relative })));
  assert.equal(results.length, relatives.length); assert.deepEqual(results.map(result => result.ok), [true, false, false, false, false, false, false, false, true]);
  if (!results[0]!.ok) assert.fail('valid declaration is unavailable');
  assert.deepEqual(results[0]!.file, readConnectionSkillFile(f.root, skillPath, relatives[0]!));
  assert.deepEqual(readConnectionSkillFiles(f.root, []), []); assert.deepEqual(readSkillTexts([]), []);
  assert.throws(() => readConnectionSkillFiles(f.root, Array.from({ length: 17 }, () => ({ skillPath, relative: 'SKILL.md' }))), { code: 'skill_content_unavailable' });
  assert.throws(() => readSkillTexts(Array.from({ length: 17 }, () => ({ directory, relative: 'SKILL.md' }))), { code: 'skill_content_unavailable' });
});

test('large catalogs schedule bounded phases without retaining a failed source', t => {
  const f = fixture(t, 18), batches: Array<Array<{ skillPath: string; relative: string }>> = [];
  const catalog = createConnectionCatalog({ assets: {
    readSkills: () => f.skills,
    readSkillFile: () => { throw new Error('Batch only'); },
    readSkillFiles: (root, requests) => { batches.push([...requests]); return readConnectionSkillFiles(root, requests); },
  } });
  fs.unlinkSync(path.join(f.root, 'skills', f.skills[0]!.path!, 'SKILL.md'));
  let result = catalog.list(f.root); assert.equal(result.definitions.length, 17); assert.equal(result.diagnostics.length, 1);
  assert.deepEqual(batches.map(batch => batch.length), [16, 2, 16, 1]);
  assert.equal(batches.slice(2).flat().some(request => request.skillPath === f.skills[0]!.path), false);
  fs.writeFileSync(path.join(f.root, 'skills', f.skills[0]!.path!, 'SKILL.md'), `---\nname: ${f.skills[0]!.id}\ndescription: restored\n---\n`);
  batches.length = 0; result = catalog.list(f.root); assert.equal(result.definitions.length, 18); assert.equal(result.diagnostics.length, 0); assert.deepEqual(batches.map(batch => batch.length), [16, 2, 16, 2]);
});


test('real bounded worker keeps source proof, diagnostics and revisions without loading private state', async t => {
  const f = fixture(t), executor = createBoundedBuildrWebReadExecutor({ workerCount: 1 });
  const catalog = createConnectionCatalog({ assets: { readSkills: readConnectionSkillSources, readSkillFile: readConnectionSkillFile, readSkillFiles: readConnectionSkillFiles } });
  try {
    const first = await executor.run('connection-catalog', { targetRoot: f.root, taskId: 'connection-directory' });
    assert.deepEqual(first, catalog.list(f.root)); assert.equal(first.definitions.length, 4);
    fs.writeFileSync(path.join(f.root, 'skills', f.skills[0]!.path!, 'SKILL.md'), '---\nname: rejected\n---\n');
    const next = await executor.run('connection-catalog', { targetRoot: f.root, taskId: 'connection-directory' });
    assert.deepEqual(next, catalog.list(f.root)); assert.equal(next.definitions.length, 3);
    assert.equal(next.diagnostics[0]?.code, 'connection_skill_entry_invalid');
    await assert.rejects(executor.run('connection-catalog', { targetRoot: f.root, taskId: 'wrong-scope' }), { code: 'local_app_read_input_invalid' });
    assert.equal(fs.existsSync(path.join(f.root, '.buildr')), false, 'source checks never create task or private credential stores');
  } finally { await executor.close(); }
});

test('directory in-flight capacity includes invalidated work and isolates workspace identity', async () => {
  const reads = new ConnectionDirectoryReads(2), scope = { rootPath: '/fixture/source', workspaceId: 'one' };
  let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; });
  const load = async () => { await gate; return { definitions: [], diagnostics: [] }; };
  const first = reads.read(scope, 'inode', load);
  assert.equal(reads.read(scope, 'inode', load), first);
  const second = reads.read({ ...scope, workspaceId: 'two' }, 'inode', load);
  reads.invalidate(scope);
  await assert.rejects(reads.read(scope, 'inode', load), { code: 'local_app_read_queue_full' });
  finish(); await Promise.all([first, second]);
  assert.deepEqual(await reads.read(scope, 'inode', load), { definitions: [], diagnostics: [] }); reads.close();
});
