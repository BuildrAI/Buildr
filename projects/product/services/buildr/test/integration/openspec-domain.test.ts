import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { registerOpenSpecApplication } from '../../src/modules/openspec/application/openspec-application.ts';

function deltaSpec(statement: any = '系统 MUST 保持可移植 identity。'): any  {
  return `## ADDED Requirements\n\n### Requirement: Portable delta identity\n${statement}\n\n#### Scenario: works\n- **WHEN** delta 被解析\n- **THEN** identity MUST 可用\n`;
}

function changeRoot(t: any, prefix: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-openspec-delta-${prefix}-`));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'checkout', 'projects', 'product', 'openspec', 'changes', 'portable-delta');
}

function writeDelta(change: any, capability: any, content: any): any  {
  const file: any = path.join(change, 'specs', capability, 'spec.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function treeSnapshot(root: any): any  {
  const result: any = {};
  const visit: any = (directory: any) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file: any = path.join(directory, entry.name);
      const relative: any = path.relative(root, file).split(path.sep).join('/');
      if (entry.isDirectory()) visit(file);
      else result[relative] = fs.readFileSync(file).toString('base64');
    }
  };
  visit(root);
  return result;
}

function diagnosticRuntime(targetRoot: any): any  {
  const runtime: any = {
    assertInitializedBuildrWorkspace: () => {},
    assertName: () => {},
    assertNoUnknownOptions: () => {},
    positionalArgs: (args: any) => [args[0]],
    optionValue: (args: any, option: any, fallback: any = null) => {
      const index: any = args.indexOf(option);
      return index === -1 ? fallback : args[index + 1];
    },
    existsDirectory: (file: any) => fs.existsSync(file) && fs.statSync(file).isDirectory(),
    existsFile: (file: any) => fs.existsSync(file) && fs.statSync(file).isFile(),
    readProjectsRegistryIfExists: () => ({ projects: { product: { source: { path: 'projects/product' } } } }),
    readComponentsManifestForWrite: () => ({ components: [{ id: 'openspec', state: 'installed' }] }),
    componentDefinitionFile: () => path.join(targetRoot, 'component.yml'),
    readComponentDefinition: () => ({ upstream: { version: '1.13.0' } }),
    runCommandsCheck: () => ({ commands: [{ id: 'openspec', status: 'ok', version: { current: '1.13.0' }, executablePath: process.execPath }] }),
  };
  return registerOpenSpecApplication(runtime, {
    projectQuery: {
      projectDetail: () => ({ project: { code: 'product', source: { type: 'workspace', path: 'projects/product' } } }),
      resolveSourceRoot: (root: string, source: { path: string }) => path.resolve(root, source.path),
    },
  });
}

test('OpenSpec deltaHash 不包含 checkout 绝对路径', (t: any) => {
  const first: any = changeRoot(t, 'first');
  const second: any = changeRoot(t, 'second');
  const normalized: any = deltaSpec();
  const firstFile: any = writeDelta(first, 'demo', normalized);
  const secondFile: any = writeDelta(second, 'demo', normalized);
  const runtime: any = createRuntime();

  const firstDelta: any = runtime.parseOpenSpecChangeDelta(first, path.resolve(import.meta.dirname, '../../node_modules/.bin/openspec'), path.resolve(first, '../../..'));
  const secondDelta: any = runtime.parseOpenSpecChangeDelta(second, path.resolve(import.meta.dirname, '../../node_modules/.bin/openspec'), path.resolve(second, '../../..'));

  assert.notEqual(firstFile, secondFile);
  assert.equal(path.isAbsolute(firstDelta.capabilities.get('demo').file), true);
  assert.equal(firstDelta.hash, secondDelta.hash);
});

test('OpenSpec deltaHash 在逻辑 delta 输入变化时改变', (t: any) => {
  const base: any = changeRoot(t, 'base');
  const changedContent: any = changeRoot(t, 'changed-content');
  const changedPath: any = changeRoot(t, 'changed-path');
  const runtime: any = createRuntime();

  writeDelta(base, 'demo', deltaSpec());
  writeDelta(changedContent, 'demo', deltaSpec('系统 MUST 使用另一条规范化语义。'));
  writeDelta(changedPath, 'other', deltaSpec());

  const baseHash: any = runtime.parseOpenSpecChangeDelta(base, path.resolve(import.meta.dirname, '../../node_modules/.bin/openspec'), path.resolve(base, '../../..')).hash;
  assert.notEqual(runtime.parseOpenSpecChangeDelta(changedContent, path.resolve(import.meta.dirname, '../../node_modules/.bin/openspec'), path.resolve(changedContent, '../../..')).hash, baseHash);
  assert.notEqual(runtime.parseOpenSpecChangeDelta(changedPath, path.resolve(import.meta.dirname, '../../node_modules/.bin/openspec'), path.resolve(changedPath, '../../..')).hash, baseHash);
});

test('converge help明确实际工作根且不自动选择其他worktree', () => {
  const buildr: any = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
  const result: any = spawnSync(process.execPath, [buildr, 'help', 'openspec', 'converge'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--target <actual-work-root>/);
  assert.match(result.stdout, /当前Workspace或matching Worktree真实根/);
  assert.match(result.stdout, /不会自动搜索或选择其他worktree/);
  assert.doesNotMatch(result.stdout, /--target <(?:dir|workspace)>/);
});

test('semantic readiness preflight help明确只读、失效与最终重检边界', () => {
  const buildr: any = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
  const result: any = spawnSync(process.execPath, [buildr, 'help', 'openspec', 'convergence', 'preflight'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--target <actual-work-root>/);
  assert.match(result.stdout, /不会写规范、恢复记录或归档/);
  assert.match(result.stdout, /只同步请求不调用 converge/);
  assert.match(result.stdout, /归档时重新检查实际输入/);
});

test('canonical target看不到active Change时零写入并指向包含Change的实际工作根', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-openspec-execution-root-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const canonicalProject: any = path.join(root, 'canonical', 'projects', 'product');
  const executionProject: any = path.join(root, 'execution', 'projects', 'product');
  fs.mkdirSync(path.join(canonicalProject, 'openspec', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(canonicalProject, 'openspec', 'changes', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(canonicalProject, 'canonical-sentinel.txt'), 'unchanged\n');
  const executionChange: any = path.join(executionProject, 'openspec', 'changes', 'task-change');
  fs.mkdirSync(path.join(executionProject, 'openspec', 'specs'), { recursive: true });
  fs.mkdirSync(executionChange, { recursive: true });
  fs.writeFileSync(path.join(executionChange, '.openspec.yaml'), 'schema: spec-driven\n');

  const runtime: any = diagnosticRuntime(path.join(root, 'canonical'));
  const before: any = treeSnapshot(canonicalProject);
  assert.throws(
    () => runtime.openSpecContractContext([
      'task-change', '--project', 'product', '--target', path.join(root, 'canonical'),
    ], {
      usage: 'buildr openspec converge <change> --project <project> [--target <actual-work-root>] [--json]',
      allowArchived: true,
    }),
    (error: any) => {
      assert.equal(error.code, 'openspec.active_change_not_found');
      assert.match(error.message, /Active OpenSpec change not found in the provided --target/);
      assert.match(error.nextAction, /当前Workspace还是matching Worktree/);
      assert.match(error.nextAction, /不得复制Change或自动搜索其他worktree/);
      assert.match(error.usage, /--target <actual-work-root>/);
      return true;
    },
  );
  assert.deepEqual(treeSnapshot(canonicalProject), before);
  assert.equal(runtime.openSpecContractChangePath(executionProject, 'task-change'), executionChange);
});

test('related overlap blocks while an unrelated malformed delta remains a warning', (t:any)=>{
 const current=changeRoot(t,'conflicts');writeDelta(current,'demo',deltaSpec());
 const unrelated=path.join(path.dirname(current),'unrelated');writeDelta(unrelated,'other','invalid delta');fs.writeFileSync(path.join(unrelated,'.openspec.yaml'),'schema: spec-driven\n');
 const runtime:any=createRuntime();const executable=path.resolve(import.meta.dirname,'../../node_modules/.bin/openspec');const projectRoot=path.resolve(current,'../../..');
 const delta=runtime.parseOpenSpecChangeDelta(current,executable,projectRoot);
 const result=runtime.createOpenSpecContractResult('preflight','portable-delta','product','1.13.0');
 const observations=runtime.detectOpenSpecActiveConflicts(projectRoot,'portable-delta',delta,result,executable);
 assert.equal(result.findings.length,0);assert.equal(observations.find((item:any)=>item.change==='unrelated').status,'unrelated-invalid');
 const other=path.join(path.dirname(current),'other');writeDelta(other,'demo',deltaSpec());fs.writeFileSync(path.join(other,'.openspec.yaml'),'schema: spec-driven\n');
 const conflict=runtime.createOpenSpecContractResult('preflight','portable-delta','product','1.13.0');runtime.detectOpenSpecActiveConflicts(projectRoot,'portable-delta',delta,conflict,executable);
 assert.equal(conflict.conflicts.length,1);
});

test('public CLI preflight and converge use declared upstream installation', (t:any)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-openspec-public-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const workspace=path.join(root,'workspace');
 const service=path.resolve(import.meta.dirname,'../..');
 const env={...process.env,PATH:`${path.join(service,'node_modules/.bin')}${path.delimiter}${process.env.PATH||''}`,BUILDR_APP_DATA_DIR:path.join(root,'app-data'),BUILDR_PRODUCT_DATA_DIR:path.join(root,'product-data'),OPENSPEC_TELEMETRY:'0'};
 const invoke=(args:string[],expected=0)=>{
   const result=spawnSync(process.execPath,[path.join(service,'bin/buildr.mjs'),...args],{cwd:service,env,encoding:'utf8'});
   assert.equal(result.status,expected,result.stderr||result.stdout);return result;
 };
 invoke(['init','--target',workspace,'--name','openspec-fixture','--profile','team']);
 invoke(['project','create','demo','--target',workspace]);
 const project=path.join(workspace,'projects/demo'),change=path.join(project,'openspec/changes/change-a');
 writeDelta(change,'demo',deltaSpec());
 fs.writeFileSync(path.join(change,'.openspec.yaml'),'schema: spec-driven\n');
 fs.writeFileSync(path.join(change,'tasks.md'),'- [x] implemented\n');
 fs.writeFileSync(path.join(change,'proposal.md'),'## Why\nFixture\n');
 fs.mkdirSync(path.join(project,'openspec/specs/demo'),{recursive:true});
 fs.writeFileSync(path.join(project,'openspec/specs/demo/spec.md'),'# Demo Specification\n\n## Purpose\n\nThis purpose describes existing behavior so the fixture passes strict upstream validation.\n\n## Requirements\n\n### Requirement: Existing\nSystem MUST retain existing behavior.\n\n#### Scenario: existing\n- **WHEN** invoked\n- **THEN** existing behavior remains\n');
 const args=['change-a','--project','demo','--target',workspace,'--json'];
 const preflight=JSON.parse(invoke(['openspec','convergence','preflight',...args]).stdout);
 assert.equal(preflight.status,'ready');assert.ok(fs.existsSync(change));
 const result=JSON.parse(invoke(['openspec','converge',...args]).stdout);
 assert.equal(result.status,'passed');assert.ok(!fs.existsSync(change));
 assert.match(fs.readFileSync(path.join(project,'openspec/specs/demo/spec.md'),'utf8'),/Portable delta identity/);
 assert.equal(JSON.parse(invoke(['openspec','converge',...args]).stdout).status,'passed');
});
