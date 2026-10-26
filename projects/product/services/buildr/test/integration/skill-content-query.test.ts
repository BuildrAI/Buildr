import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSkillContentQuery } from '../../src/modules/agent-assets/application/skill-content-query.ts';
import { createAgentAssetsHttpContribution } from '../../src/modules/agent-assets/interfaces/http/agent-assets-http.ts';
import { AGENT_ASSETS_HTTP_OPERATIONS, AGENT_ASSETS_HTTP_VALIDATORS } from '../../src/modules/agent-assets/interfaces/http/agent-assets-http-contracts.ts';

test('技能读取覆盖真实目录、类型化 HTTP 结果与零写入', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skills-read-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'skills/demo');
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  const content = '---\nname: demo\ndescription: demo\n---\n\n```md\n# 错误示例标题\n```\n# 真正的标题\n\n[细节](references/guide.md)\n';
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content);
  fs.writeFileSync(path.join(dir, 'references/guide.md'), '# 细节\n');
  fs.writeFileSync(path.join(root, 'secret.md'), 'private outside');
  fs.symlinkSync(path.join(root, 'secret.md'), path.join(dir, 'link.md'));
  fs.symlinkSync(root, path.join(dir, 'escape'));
  fs.writeFileSync(path.join(dir, 'oversize.md'), 'x'.repeat(512 * 1024 + 1));
  fs.writeFileSync(path.join(dir, 'image.png'), Buffer.from([0, 1, 2]));
  const entries = [{ id: 'demo', path: 'demo', description: '目录读取', source: 'buildr', enabled: false, required: true }, { id: 'missing', path: 'missing' }, { id: 'remote', source: { url: 'https://example.invalid/skill' } }];
  const query = createSkillContentQuery({ readSkillsManifestForWrite: () => entries });
  assert.equal(query.listSkills(root).skills[0].title, '真正的标题');
  assert.equal(query.listSkills(root).skills[0].enabled, false);
  assert.equal(query.listSkills(root).skills[1].contentIssue, '本地技能内容不存在。');
  assert.equal(query.skillDetail(root, 'remote').files.length, 0);
  const detail = query.skillDetail(root, 'demo');
  assert.equal(detail.files.find((file) => file.path === 'link.md')?.readable, false);
  assert.equal(detail.files.find((file) => file.path === 'image.png')?.readable, false);
  assert.equal(query.skillFile(root, 'demo', 'references/guide.md').content, '# 细节\n');
  assert.throws(() => query.skillFile(root, 'demo', '../secret.md'));
  assert.throws(() => query.skillFile(root, 'demo', '/secret.md'));
  assert.throws(() => query.skillFile(root, 'demo', 'link.md'));
  assert.throws(() => query.skillFile(root, 'demo', 'escape/secret.md'));
  assert.throws(() => query.skillFile(root, 'demo', 'oversize.md'), /512 KiB/);
  assert.throws(() => query.skillFile(root, 'demo', 'image.png'), /文件类型/);
  assert.throws(() => query.skillDetail(root, 'unknown'), /未登记/);
  const http = createAgentAssetsHttpContribution(query);
  for (const [suffix, operation] of [['/agent-assets/skills', 'agent-assets.skills.list'], ['/agent-assets/skills/demo', 'agent-assets.skills.detail'], ['/agent-assets/skills/demo/file', 'agent-assets.skills.file']]) {
    const result = await http.handle({ request: { method: 'GET' }, root, suffix, searchParams: new URLSearchParams('file=references%2Fguide.md') });
    assert.equal(result.status, 200);
    const op = AGENT_ASSETS_HTTP_OPERATIONS.find((item: any) => item.id === operation);
    assert.ok(op);
    assert.equal(AGENT_ASSETS_HTTP_VALIDATORS.validate(op.successSchemaId, result.body).valid, true);
    assert.equal(AGENT_ASSETS_HTTP_VALIDATORS.validate(op.errorSchemaId, { error: { code: 'skill_content_unavailable', message: '无法读取' } }).valid, true);
    assert.equal(AGENT_ASSETS_HTTP_VALIDATORS.validate(op.requestSchemaId, { unknown: true }).valid, false);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), content);
  assert.equal(fs.readFileSync(path.join(root, 'secret.md'), 'utf8'), 'private outside');
});

test('目录枚举有界且源目录符号链接被拒绝', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skills-bound-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'skills/demo'), { recursive: true });
  for (let i = 0; i < 510; i++) fs.writeFileSync(path.join(root, 'skills/demo', `${i}.md`), 'x');
  fs.symlinkSync(path.join(root, 'skills/demo'), path.join(root, 'skills/alias'));
  const query = createSkillContentQuery({ readSkillsManifestForWrite: () => [{ id: 'demo', path: 'demo' }, { id: 'alias', path: 'alias' }] });
  assert.equal(query.skillDetail(root, 'demo').truncated, true);
  assert.ok(query.skillDetail(root, 'demo').files.length <= 500);
  assert.match(query.skillDetail(root, 'alias').issue || '', /符号链接/);
});

test('技能打开只解析已登记来源，校验目录并经过 HTTP 写保护', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-skill-open-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'skills/demo'),{recursive:true});fs.writeFileSync(path.join(root,'skills/demo/SKILL.md'),'# Demo');fs.symlinkSync(root,path.join(root,'skills/alias'));
  const opened:string[]=[];const app=createSkillContentQuery({readSkillsManifestForWrite:()=>[{id:'demo',path:'demo'},{id:'alias',path:'alias'},{id:'escape',path:'../../outside'}]},async directory=>{opened.push(directory);return {requested:true};});
  const actualDirectory=fs.realpathSync(path.join(root,'skills/demo'));
  assert.equal(app.listSkills(root).skills[0].sourcePath,actualDirectory);
  await app.openSkillSource(root,'demo');assert.deepEqual(opened,[actualDirectory]);
  await assert.rejects(app.openSkillSource(root,'alias'));await assert.rejects(app.openSkillSource(root,'escape'));await assert.rejects(app.openSkillSource(root,'unknown'));
  const http=createAgentAssetsHttpContribution(app);const context={request:{method:'POST'},root,suffix:'/agent-assets/skills/demo/open',authorizeWrite:()=>{throw new Error('protected');},readJsonBody:async()=>({})};
  await assert.rejects(http.handle(context),/protected/);assert.equal(opened.length,1);
  await assert.rejects(http.handle({...context,authorizeWrite:()=>{},readJsonBody:async()=>({path:'/etc'})}),/契约/);assert.equal(opened.length,1);
  assert.equal((await http.handle({...context,authorizeWrite:()=>{}})).body.requested,true);assert.equal(opened.length,2);
});

test('共享技能打开实际资源集来源，避免跳回工作空间的逻辑路径', async t => {
  const {ensurePackageResources}=await import('../../src/infrastructure/product-resources/shared-resources.ts');
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-shared-skill-open-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const previous=process.env.BUILDR_PRODUCT_DATA_DIR;process.env.BUILDR_PRODUCT_DATA_DIR=path.join(base,'data');t.after(()=>{if(previous===undefined)delete process.env.BUILDR_PRODUCT_DATA_DIR;else process.env.BUILDR_PRODUCT_DATA_DIR=previous;});
  const product=path.join(base,'product'),root=path.join(base,'workspace');fs.mkdirSync(path.join(product,'resources/workspace/skills/buildr/demo'),{recursive:true});fs.writeFileSync(path.join(product,'package.json'),'{"version":"1.2.3"}');fs.writeFileSync(path.join(product,'resources/workspace/skills/buildr/demo/SKILL.md'),'# Shared');
  const set=ensurePackageResources(product);fs.mkdirSync(path.join(root,'.buildr/local'),{recursive:true});fs.writeFileSync(path.join(root,'.buildr/local/package-resources.json'),JSON.stringify({schemaVersion:'buildr.resource-adoption/v1',resourceSet:set.id,ready:true}));
  let opened='';const query=createSkillContentQuery({readSkillsManifestForWrite:()=>[{id:'demo',path:'buildr/demo',resource:'workspace/skills/buildr/demo',source:'buildr'}]},async dir=>{opened=dir;return {requested:true};});
  const expected=path.join(base,'data/resources','skills/buildr/demo');assert.equal(query.listSkills(root).skills[0].sourcePath,expected);await query.openSkillSource(root,'demo');assert.equal(opened,expected);assert.equal(fs.existsSync(path.join(root,'skills/buildr/demo')),false);
});
