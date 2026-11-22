import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HarnessDirectoryHost, DIRECTORY_SOURCE_ID } from '../../src/application/directory-host.ts';
import { LocalWorkspaceAuthority, readYamlTopLevelScalars, resolveLocalDefaultWorkspaceRoot } from '../../src/application/local-workspaces.ts';
import { createHash } from 'node:crypto';
import { createAgentService, executionScopeKey } from '../../src/index.ts';
import { AgentHostRegistry } from '../../src/process/host-channel.ts';

test('directory authority persists exact references without a business workspace, and isolates optional capabilities', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-directories-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const dataRoot = path.join(root, 'data'), first = path.join(root, 'one'), second = path.join(root, 'two');
  fs.mkdirSync(first); fs.mkdirSync(second);
  const host = new HarnessDirectoryHost(dataRoot), a = host.register(first, '  '), b = host.register(second, '  自定义工作空间  ');
  assert.equal(a.name,'one');
  assert.equal(b.name,'自定义工作空间');
  const longPath=path.join(root,'x'.repeat(170));fs.mkdirSync(longPath);
  const longNamed=host.register(longPath);assert.equal(longNamed.name,'x'.repeat(170));
  assert.equal(new HarnessDirectoryHost(dataRoot).list().find(item=>item.ref.id===longNamed.ref.id)?.name,longNamed.name);
  assert.equal(new HarnessDirectoryHost(dataRoot).list()[1]?.name,'自定义工作空间');
  assert.deepEqual(host.register(second,'自定义工作空间'),b);
  assert.throws(()=>host.register(second,'其他名称'),{code:'agent_directory_already_registered'});
  assert.throws(()=>host.register(first,'x'.repeat(161)),{code:'agent_directory_name_invalid'});
  assert.equal(a.ref.sourceId, DIRECTORY_SOURCE_ID);
  assert.notEqual(a.ref.id, b.ref.id);
  assert.deepEqual(host.register(first), a, 'repeated selection preserves the same identity');
  assert.deepEqual(await new HarnessDirectoryHost(dataRoot).resolveExecutionScope({ref: a.ref}), a);
  await assert.rejects(host.resolveExecutionScope({ref: {...a.ref, sourceId: 'buildr'}}), {code: 'agent_directory_missing'});
  await assert.rejects(host.resolveExecutionScope({ref: {...a.ref, id: first}}), {code: 'agent_directory_missing'});
  await assert.rejects(host.resolveExecutionScope({ref: a.ref, expectedRevision: 'stale'}), {code: 'agent_scope_binding_changed'});
  const service = createAgentService({dataRoot, host, executors: [], modelProviders: []});
  t.after(() => service.close());
  const chat = await service.conversations.create(executionScopeKey(a.ref), {});
  assert.equal(chat.cwd, fs.realpathSync(first));
  assert.deepEqual(chat.taskIds ?? [], []);
  const other = await service.conversations.create(executionScopeKey(b.ref), {});
  assert.equal(other.cwd, fs.realpathSync(second));
  await assert.rejects(host.verifyWorkObject(), {code: 'agent_host_capability_unavailable'});
  assert.equal(fs.existsSync(path.join(first, '.buildr')), false);
  assert.equal(fs.existsSync(path.join(second, '.buildr')), false);
  const registry = new AgentHostRegistry(host);
  assert.deepEqual(await registry.resolveExecutionScope({ref: a.ref}), a);
  assert.throws(() => registry.attach({sourceId: DIRECTORY_SOURCE_ID, peerId: 'forged', origin: 'http://127.0.0.1:1', token: 'x'.repeat(40)}), {code: 'agent_host_source_reserved'});
});

test('replacing a directory or a selected symlink cannot silently rebind old work', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-directory-replacement-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const host = new HarnessDirectoryHost(path.join(root, 'data')), target = path.join(root, 'target');
  fs.mkdirSync(target);
  const original = host.register(target);
  fs.renameSync(target, target + '-retained'); fs.mkdirSync(target);
  await assert.rejects(host.resolveExecutionScope({ref: original.ref}), {code: 'agent_scope_binding_changed'});
  assert.throws(() => host.register(target), {code: 'agent_scope_binding_changed'});
  assert.deepEqual(host.list(), [original], 'failed admission leaves the old record intact');
  fs.rmSync(target, {recursive: true});
  await assert.rejects(host.resolveExecutionScope({ref: original.ref}), {code: 'agent_directory_unavailable'});
  fs.renameSync(target + '-retained', target);
  assert.deepEqual(await host.resolveExecutionScope({ref: original.ref}), original);
  const link = path.join(root, 'selected');
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  const selected = host.register(link);
  // The target is unchanged, but replacing the link is still an identity change.
  fs.renameSync(link, link + '-retained');
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(host.resolveExecutionScope({ref: selected.ref}), {code: 'agent_scope_binding_changed'});
  assert.throws(() => host.register('relative/path'), {code: 'agent_directory_path_invalid'});
});


test('legacy directory records without names retain identity and get a default display name',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-legacy-directory-name-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const work=path.join(root,'旧目录'),dataRoot=path.join(root,'profile');fs.mkdirSync(work);
 const host=new HarnessDirectoryHost(dataRoot),created=host.register(work);
 const {name,...legacy}=created;
 fs.writeFileSync(path.join(dataRoot,'agent-service/directories.json'),JSON.stringify({version:1,directories:[legacy]})+'\n');
 const restored=new HarnessDirectoryHost(dataRoot);
 assert.deepEqual(await restored.resolveExecutionScope({ref:legacy.ref}),legacy);
 assert.deepEqual(restored.register(work),legacy);
 const catalog=await restored.listExecutionScopes({sourceId:DIRECTORY_SOURCE_ID});
 assert.equal(catalog.labels[legacy.ref.id],'旧目录');
 assert.equal(catalog.rootPaths[legacy.ref.id],fs.realpathSync(work));
});

test('local workspace authority resolves registered workspaces and @default without Development, detects conflicts and deduplicates directory registration', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-local-workspaces-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataRoot = path.join(root, 'data');
  const canonicalDir = path.join(root, 'canonical');
  const legacyDir = path.join(root, 'legacy');
  const conflictingDir = path.join(root, 'conflict');
  const duplicateA = path.join(root, 'dup-a');
  const duplicateB = path.join(root, 'dup-b');
  for (const dir of [canonicalDir, legacyDir, conflictingDir, duplicateA, duplicateB]) {
    fs.mkdirSync(path.join(dir, '.buildr'), { recursive: true });
  }
  const canonicalId = '11111111-1111-4111-8111-111111111111';
  const legacyId = '22222222-2222-4222-8222-222222222222';
  const conflictA = '33333333-3333-4333-8333-333333333333';
  const conflictB = '44444444-4444-4444-8444-444444444444';
  const duplicateId = '55555555-5555-4555-8555-555555555555';

  fs.writeFileSync(path.join(canonicalDir, '.buildr', 'workspace.yml'), [
    'schemaVersion: buildr.workspace/v1',
    `id: ${canonicalId}`,
    'name: "研发空间 #1 \\"quoted\\"" # inline comment',
    'description: |-',
    '  多行描述内容',
    '  id: not-a-top-level-key',
    'runtime:',
    '  adapter: codex',
  ].join('\n') + '\n');

  fs.writeFileSync(path.join(legacyDir, '.buildr', 'workspace.yml'), 'schemaVersion: 1\nname: \'旧版\'\'\u7a7a间\'\n');
  fs.mkdirSync(path.join(legacyDir, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(legacyDir, 'skills', 'manifest.yml'), `workspaceId: ${legacyId}\n`);

  fs.writeFileSync(path.join(conflictingDir, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${conflictA}\nname: 冲突空间\n`);
  fs.mkdirSync(path.join(conflictingDir, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(conflictingDir, 'skills', 'manifest.yml'), `workspaceId: ${conflictB}\n`);

  fs.writeFileSync(path.join(duplicateA, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${duplicateId}\nname: 重复A\n`);
  fs.writeFileSync(path.join(duplicateB, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${duplicateId}\nname: 重复B\n`);

  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'workspace-registry.json'), JSON.stringify({
    schemaVersion: 'buildr.local-workspace-registry/v1',
    roots: [canonicalDir, legacyDir, conflictingDir, duplicateA, duplicateB],
    lastOpenedRoot: canonicalDir,
  }, null, 2));

  const scalars = readYamlTopLevelScalars(fs.readFileSync(path.join(canonicalDir, '.buildr', 'workspace.yml'), 'utf8'));
  assert.equal(scalars.name, '研发空间 #1 "quoted"');
  assert.equal(scalars.id, canonicalId);

  const authority = new LocalWorkspaceAuthority(dataRoot);
  const listed = authority.listRegistered();
  assert.deepEqual(listed.map(item => item.ref.id), [canonicalId, legacyId]);
  assert.equal(listed[0]?.name, '研发空间 #1 "quoted"');
  assert.equal(listed[1]?.name, '旧版\'空间');

  const realCanonical = fs.realpathSync(canonicalDir);
  const info = fs.statSync(realCanonical);
  const expectedRevision = createHash('sha256').update(JSON.stringify([{ sourceId: 'buildr', id: canonicalId }, realCanonical, info.ino, info.birthtimeMs])).digest('hex');

  const directories = new HarnessDirectoryHost(dataRoot, authority);
  const registry = new AgentHostRegistry(directories, authority);

  const resolved = await registry.resolveExecutionScope({ ref: { sourceId: 'buildr', id: canonicalId } });
  assert.equal(resolved.rootPath, realCanonical);
  assert.equal(resolved.revision, expectedRevision);

  const reused = directories.register(canonicalDir);
  assert.deepEqual(reused.ref, { sourceId: 'buildr', id: canonicalId });
  assert.deepEqual(directories.list(), [], 'reusing a registered local workspace must not create a harness-local entry');
  assert.throws(() => directories.register(canonicalDir, '其他名称'), { code: 'agent_directory_already_registered' });

  await assert.rejects(registry.resolveExecutionScope({ ref: { sourceId: 'buildr', id: conflictA } }), { code: 'agent_scope_binding_changed' });
  await assert.rejects(registry.resolveExecutionScope({ ref: { sourceId: 'buildr', id: duplicateId } }), { code: 'agent_scope_binding_changed' });
  await assert.rejects(registry.resolveExecutionScope({ ref: { sourceId: 'buildr', id: 'unknown-id' } }), { code: 'agent_host_unavailable' });

  fs.renameSync(canonicalDir, canonicalDir + '-moved');
  fs.mkdirSync(path.join(canonicalDir, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(canonicalDir, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${canonicalId}\nname: 替换目录\n`);
  await assert.rejects(registry.resolveExecutionScope({ ref: { sourceId: 'buildr', id: canonicalId }, expectedRevision }), { code: 'agent_scope_binding_changed' });
  fs.rmSync(canonicalDir, { recursive: true, force: true });
  fs.renameSync(canonicalDir + '-moved', canonicalDir);
  assert.equal((await registry.resolveExecutionScope({ ref: { sourceId: 'buildr', id: canonicalId }, expectedRevision })).revision, expectedRevision);

  if (process.getuid?.() !== 0) {
    fs.chmodSync(canonicalDir, 0o111);
    try {
      await assert.rejects(registry.resolveExecutionScope({ ref: { sourceId: 'buildr', id: canonicalId }, expectedRevision }), { code: 'agent_directory_unavailable' });
    } finally {
      fs.chmodSync(canonicalDir, 0o755);
    }
  }

  const defaultScope = await registry.resolveExecutionScope({ ref: { sourceId: 'buildr', id: '@default' } });
  assert.equal(defaultScope.rootPath, fs.realpathSync(resolveLocalDefaultWorkspaceRoot(dataRoot)));
});
