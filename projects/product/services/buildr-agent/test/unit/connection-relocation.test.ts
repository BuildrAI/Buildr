import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { listConnectionExecutables, relocateConnections } from '../../src/persistence/connection-relocation.ts';

function schema(db: DatabaseSync): void {
  db.exec(`CREATE TABLE connections(id TEXT PRIMARY KEY, provider TEXT NOT NULL UNIQUE, revision TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE conversations(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT, hidden INTEGER NOT NULL, updated_at TEXT NOT NULL, revision TEXT NOT NULL, body TEXT NOT NULL);
    PRAGMA user_version=1;`);
}

function seed(t: test.TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-relocate-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'dev');
  const targetRoot = path.join(root, 'preview');
  const sourceAgent = path.join(sourceRoot, 'agent-service');
  const targetAgent = path.join(targetRoot, 'agent-service');
  const executable = path.join(sourceAgent, 'programs', 'qoder', '1.1.75-darwin-arm64', 'node_modules', '@qoder-ai', 'qoder-agent-sdk', 'dist', '_bundled', 'qodercli');
  const config = path.join(sourceAgent, 'connections', 'qoder', 'qoder-config');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(executable, '#!/bin/sh\n', { mode: 0o700 });
  fs.writeFileSync(path.join(config, 'auth.json'), '{"user":"fixture"}\n');
  const sourceDatabase = path.join(sourceAgent, 'conversations.sqlite');
  const db = new DatabaseSync(sourceDatabase);
  schema(db);
  const info = fs.statSync(config);
  const body = {
    view: {
      id: 'qoder', provider: 'qoder', label: 'Qoder', revision: 'r1', status: 'ready', enabled: true,
      executable, configPath: path.join(sourceAgent, 'connections', 'qoder'), capabilities: { text: true, images: false, maxInputBytes: 1024 },
      models: [],
    },
    bindingIdentity: 'old-identity',
    bindingData: { format: 'buildr-native-binding/v2', provider: 'qoder', executable, config, dev: info.dev, ino: info.ino, series: '1.1', observedVersion: '1.1.75' },
  };
  db.prepare('INSERT INTO connections(id,provider,revision,body) VALUES(?,?,?,?)').run('qoder', 'qoder', 'r1', JSON.stringify(body));
  db.prepare('INSERT INTO conversations(id,workspace_id,task_id,hidden,updated_at,revision,body) VALUES(?,?,?,?,?,?,?)').run('source-conversation', 'ws', null, 0, 'now', 'r1', '{}');
  const sourceBytes = fs.readFileSync(sourceDatabase);
  db.close();

  const targetDatabase = path.join(targetAgent, 'conversations.sqlite');
  fs.mkdirSync(targetAgent, { recursive: true });
  const targetExecutable = path.join(targetAgent, 'programs', 'qoder', '1.1.75-darwin-arm64', 'node_modules', '@qoder-ai', 'qoder-agent-sdk', 'dist', '_bundled', 'qodercli');
  const targetConfig = path.join(targetAgent, 'connections', 'qoder', 'qoder-config');
  fs.mkdirSync(path.dirname(targetExecutable), { recursive: true });
  fs.mkdirSync(targetConfig, { recursive: true });
  fs.copyFileSync(executable, targetExecutable);
  fs.copyFileSync(path.join(config, 'auth.json'), path.join(targetConfig, 'auth.json'));
  const targetDb = new DatabaseSync(targetDatabase);
  schema(targetDb);
  targetDb.prepare('INSERT INTO conversations(id,workspace_id,task_id,hidden,updated_at,revision,body) VALUES(?,?,?,?,?,?,?)').run('preview-conversation', 'ws', null, 0, 'now', 'r1', '{}');
  targetDb.close();
  return { root, sourceRoot, targetRoot, executable, config, sourceDatabase, targetDatabase, sourceBytes };
}

test('连接重定位只读写 connections 表并重建预览内绑定', (t) => {
  const fixture = seed(t);
  assert.deepEqual(listConnectionExecutables({ sourceRoot: fixture.sourceRoot }), [fixture.executable]);
  const result = relocateConnections({ sourceRoot: fixture.sourceRoot, targetRoot: fixture.targetRoot });
  assert.deepEqual(result, { relocated: ['qoder'], failed: [] });

  const db = new DatabaseSync(fixture.targetDatabase, { readOnly: true });
  const row = db.prepare('SELECT body FROM connections WHERE id=?').get('qoder') as { body: string };
  const conversation = db.prepare("SELECT body FROM conversations WHERE id='preview-conversation'").get() as { body: string };
  const allConversations = db.prepare('SELECT COUNT(*) AS count FROM conversations').get() as { count: number };
  db.close();
  const record = JSON.parse(row.body);
  const targetConnections = path.join(fixture.targetRoot, 'agent-service', 'connections', 'qoder');
  const targetConfig = path.join(targetConnections, 'qoder-config');
  const targetExecutable = path.join(fixture.targetRoot, 'agent-service', 'programs', 'qoder', '1.1.75-darwin-arm64', 'node_modules', '@qoder-ai', 'qoder-agent-sdk', 'dist', '_bundled', 'qodercli');
  assert.equal(record.view.executable, targetExecutable);
  assert.equal(record.view.configPath, targetConnections);
  assert.equal(record.bindingData.executable, targetExecutable);
  assert.equal(record.bindingData.config, targetConfig);
  const info = fs.statSync(targetConfig);
  assert.equal(record.bindingData.dev, info.dev);
  assert.equal(record.bindingData.ino, info.ino);
  const provenance = { format: 'buildr-native-binding/v2', provider: 'qoder', executable: fs.realpathSync(targetExecutable), config: fs.realpathSync(targetConfig), dev: info.dev, ino: info.ino, series: '1.1' };
  assert.equal(record.bindingIdentity, createHash('sha256').update(JSON.stringify(provenance)).digest('hex'));
  assert.notEqual(record.bindingIdentity, 'old-identity');
  assert.equal(JSON.stringify(record).includes(fixture.sourceRoot), false);
  assert.equal(conversation.body, '{}');
  assert.equal(allConversations.count, 1);
  assert.deepEqual(fs.readFileSync(fixture.sourceDatabase), fixture.sourceBytes);
});

test('重定位失败时不写入指向来源根的回退连接', (t) => {
  const fixture = seed(t);
  fs.rmSync(path.join(fixture.targetRoot, 'agent-service', 'connections', 'qoder'), { recursive: true, force: true });
  const result = relocateConnections({ sourceRoot: fixture.sourceRoot, targetRoot: fixture.targetRoot });
  assert.deepEqual(result.relocated, []);
  assert.equal(result.failed[0]?.provider, 'qoder');
  assert.equal(result.failed[0]?.stage, 'binding');
  const db = new DatabaseSync(fixture.targetDatabase, { readOnly: true });
  const count = db.prepare('SELECT COUNT(*) AS count FROM connections').get() as { count: number };
  db.close();
  assert.equal(count.count, 0);
});

test('来源与目标相同或没有来源库时保持安全', (t) => {
  const fixture = seed(t);
  assert.throws(() => relocateConnections({ sourceRoot: fixture.sourceRoot, targetRoot: fixture.sourceRoot }), /agent_relocation_same_root/);
  const empty = path.join(fixture.root, 'empty');
  assert.deepEqual(relocateConnections({ sourceRoot: empty, targetRoot: path.join(fixture.root, 'empty-preview') }), { relocated: [], failed: [] });
  assert.deepEqual(listConnectionExecutables({ sourceRoot: empty }), []);
});

test('来源数据根之外的系统程序保持只读引用', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-relocate-system-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'dev');
  const targetRoot = path.join(root, 'preview');
  const executable = path.join(root, 'system', 'codex-cli');
  const sourceConfig = path.join(sourceRoot, 'agent-service', 'connections', 'codex', 'codex-home');
  const targetConfig = path.join(targetRoot, 'agent-service', 'connections', 'codex', 'codex-home');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.mkdirSync(sourceConfig, { recursive: true });
  fs.mkdirSync(targetConfig, { recursive: true });
  fs.writeFileSync(executable, '#!/bin/sh\n', { mode: 0o700 });
  fs.writeFileSync(path.join(sourceConfig, 'auth.json'), '{}\n');
  fs.writeFileSync(path.join(targetConfig, 'auth.json'), '{}\n');
  const sourceDatabase = path.join(sourceRoot, 'agent-service', 'conversations.sqlite');
  fs.mkdirSync(path.dirname(sourceDatabase), { recursive: true });
  const db = new DatabaseSync(sourceDatabase);
  schema(db);
  const info = fs.statSync(targetConfig);
  db.prepare('INSERT INTO connections(id,provider,revision,body) VALUES(?,?,?,?)').run('codex', 'codex', 'r1', JSON.stringify({
    view: { id: 'codex', provider: 'codex', label: 'Codex', revision: 'r1', status: 'ready', enabled: true, executable, configPath: path.join(sourceRoot, 'agent-service', 'connections', 'codex'), capabilities: { text: true }, models: [] },
    bindingIdentity: 'old',
    bindingData: { format: 'buildr-native-binding/v2', provider: 'codex', executable, config: targetConfig, dev: info.dev, ino: info.ino, series: '0.163', observedVersion: '0.163.0' },
  }));
  db.close();
  const result = relocateConnections({ sourceRoot, targetRoot });
  assert.deepEqual(result, { relocated: ['codex'], failed: [] });
  const target = new DatabaseSync(path.join(targetRoot, 'agent-service', 'conversations.sqlite'), { readOnly: true });
  const record = JSON.parse((target.prepare("SELECT body FROM connections WHERE id='codex'").get() as { body: string }).body);
  target.close();
  assert.equal(record.view.executable, executable);
  assert.equal(record.bindingData.executable, executable);
  assert.equal(fs.existsSync(path.join(targetRoot, 'agent-service', 'programs')), false);
});

test('升级后的来源别名不再依赖原桌面文件，重定位仍核对实际独立程序', t=>{
  const fixture=seed(t),source=new DatabaseSync(fixture.sourceDatabase),alias=path.join(fixture.root,'removed.app','qodercli');
  const row=source.prepare("SELECT body FROM connections WHERE id='qoder'").get() as {body:string},record=JSON.parse(row.body);
  record.programSource=alias;record.bindingData.executable=alias;
  source.prepare("UPDATE connections SET body=? WHERE id='qoder'").run(JSON.stringify(record));source.close();
  assert.deepEqual(listConnectionExecutables({sourceRoot:fixture.sourceRoot}),[fixture.executable]);
  assert.deepEqual(relocateConnections({sourceRoot:fixture.sourceRoot,targetRoot:fixture.targetRoot}),{relocated:['qoder'],failed:[]});
  const target=new DatabaseSync(fixture.targetDatabase,{readOnly:true});
  const updated=JSON.parse((target.prepare("SELECT body FROM connections WHERE id='qoder'").get() as {body:string}).body);target.close();
  assert.equal(updated.programSource,alias);assert.equal(updated.bindingData.executable,alias);assert.ok(fs.existsSync(updated.view.executable));assert.equal(fs.existsSync(alias),false);
});
