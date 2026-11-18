import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HarnessDirectoryHost, DIRECTORY_SOURCE_ID } from '../../src/application/directory-host.ts';
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
