import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { AGENT_EXECUTION_CONTRACTS } from '../../src/index.ts';
import { prepareAgentRuntime, validateAgentRuntime } from '../../src/process/runtime-unit.ts';
import { shareFixtureNode, withImmutableProcessInputs } from '../support/immutable-process-inputs.ts';
import { acquirePreparedProcessFixture, withPreparedProcessFixture } from '../support/prepared-process-fixture.ts';

test('prepared process fixture leases isolate mutation, reject seed pollution and clean after failure', { skip: process.platform === 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-fixture-isolation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packageRoot = packageInput(root), node = path.join(root, 'fixture-node');
  fs.writeFileSync(node, 'private fixture executable bytes');
  const producer = (dataRoot: string) => prepareAgentRuntime({ dataRoot, packageRoot, node, entry: 'build/entry.js' });
  let seedRoot = '', originalDigest = '';
  assert.throws(() => withPreparedProcessFixture(env => {
    seedRoot = env.BUILDR_AGENT_TEST_FIXTURE_ROOT!;
    const leftRoot = path.join(root, 'left'), rightRoot = path.join(root, 'right');
    const left = acquirePreparedProcessFixture(leftRoot, env), right = acquirePreparedProcessFixture(rightRoot, env);
    originalDigest = left.digest;
    assert.equal(left.digest, right.digest);
    assert.notEqual(left.directory, right.directory);
    assert.notEqual(fs.statSync(left.entry).ino, fs.statSync(right.entry).ino);
    assert.notEqual(fs.statSync(left.node).ino, fs.statSync(right.node).ino);
    fs.chmodSync(left.entry, 0o600); fs.writeFileSync(left.entry, 'changed private input');
    assert.throws(() => validateAgentRuntime(leftRoot, left), { code: 'agent_runtime_changed' });
    assert.doesNotThrow(() => validateAgentRuntime(rightRoot, right));
    fs.rmSync(leftRoot, { recursive: true, force: true });
    assert.doesNotThrow(() => validateAgentRuntime(rightRoot, right), 'peer cleanup cannot invalidate a lease');
    assert.throws(() => acquirePreparedProcessFixture(rightRoot, env), /already exists/);
    const seed = JSON.parse(fs.readFileSync(path.join(seedRoot, 'fixture.json'), 'utf8'));
    fs.chmodSync(seed.entry, 0o600); fs.writeFileSync(seed.entry, 'polluted seed');
    assert.throws(() => acquirePreparedProcessFixture(path.join(root, 'third'), env), { code: 'agent_runtime_changed' });
    throw new Error('fixture-run-failed');
  }, {}, producer), /fixture-run-failed/);
  assert.equal(fs.existsSync(seedRoot), false, 'producer cleanup also runs on an assertion failure');
  fs.writeFileSync(path.join(packageRoot, 'build/entry.js'), 'export const changed = true;\n');
  withPreparedProcessFixture(env => {
    const fresh = acquirePreparedProcessFixture(path.join(root, 'fresh'), env);
    assert.notEqual(fresh.digest, originalDigest, 'a new run must prepare current input, not adopt the old seed');
    return 0;
  }, {}, producer);
});

function packageInput(root: string, large=false) {
  const pkg=path.join(root,'package');fs.mkdirSync(path.join(pkg,'build'),{recursive:true});
  fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({type:'module'}));
  fs.writeFileSync(path.join(pkg,'build/entry.js'),'export {};\n');
  fs.writeFileSync(path.join(pkg,'build/runtime-contracts.json'),JSON.stringify({contracts:AGENT_EXECUTION_CONTRACTS,storageVersion:1,parallelCompatibility:3}));
  if (large) {
    fs.mkdirSync(path.join(pkg,'node_modules/dependency'),{recursive:true});
    fs.writeFileSync(path.join(pkg,'node_modules/dependency/data'),Buffer.alloc(3*1024*1024+13,7));
    fs.writeFileSync(path.join(pkg,'build/large'),Buffer.alloc(5*1024*1024+31,11));
  }
  return pkg;
}

test('bounded runtime hashing preserves the complete legacy digest and detects copied-node and tree tampering', t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-runtime-digest-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const packageRoot=packageInput(root,true), node=path.join(root,'node-input'), dataRoot=path.join(root,'profile');
  fs.writeFileSync(node,Buffer.alloc(8*1024*1024+17,19));
  const entry='build/entry.js', names=['package.json',...fs.globSync('build/**/*',{cwd:packageRoot}),...fs.globSync('node_modules/**/*',{cwd:packageRoot})]
    .filter(name=>fs.statSync(path.join(packageRoot,name)).isFile()).sort();
  // Independent reference: the pre-optimization full-buffer algorithm and byte order.
  const expected=createHash('sha256');expected.update(JSON.stringify({entry,node:createHash('sha256').update(fs.readFileSync(node)).digest('hex')}));
  for(const name of names){expected.update(JSON.stringify([name,fs.statSync(path.join(packageRoot,name)).mode&0o111]));expected.update(fs.readFileSync(path.join(packageRoot,name)));}
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,node,entry});
  assert.equal(runtime.digest,expected.digest('hex'));
  fs.writeFileSync(node,Buffer.alloc(9,23));
  fs.writeFileSync(path.join(packageRoot,'build/large'),'source was changed');
  assert.doesNotThrow(()=>validateAgentRuntime(dataRoot,runtime),'copy-on-write preserves independent retained bytes');
  if (process.getuid?.()!==0) assert.throws(()=>fs.writeFileSync(runtime.node,'blocked'),{code:'EACCES'});
  fs.chmodSync(runtime.node,0o700);fs.writeFileSync(runtime.node,'tampered');assert.throws(()=>validateAgentRuntime(dataRoot,runtime),{code:'agent_runtime_changed'});
  fs.writeFileSync(runtime.node,Buffer.alloc(8*1024*1024+17,19));
  fs.chmodSync(path.join(runtime.directory,'build/entry.js'),0o600);fs.writeFileSync(path.join(runtime.directory,'build/entry.js'),'tampered');assert.throws(()=>validateAgentRuntime(dataRoot,runtime),{code:'agent_runtime_changed'});
});

test('test Node sharing keeps private paths, rejects mutation, survives peer cleanup and never links the installed executable', {skip:process.platform==='win32'}, ()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-runtime-inputs-')), packageRoot=packageInput(root);
  let inputRoot='';
  const result=withImmutableProcessInputs(env=>{
    inputRoot=env.BUILDR_AGENT_TEST_INPUT_ROOT!;
    try {
      const prepare=(name: string)=>prepareAgentRuntime({dataRoot:path.join(root,name),packageRoot,entry:'build/entry.js'});
      const first=shareFixtureNode(prepare('one'),env),second=shareFixtureNode(prepare('two'),env);
      assert.notEqual(first.node,second.node);assert.equal(fs.statSync(first.node).ino,fs.statSync(second.node).ino);
      assert.notEqual(fs.statSync(first.node).ino,fs.statSync(process.execPath).ino);
      assert.equal(fs.statSync(first.node).mode&0o222,0);
      if (process.getuid?.()!==0) assert.throws(()=>fs.writeFileSync(first.node,'must not write'),{code:'EACCES'});
      fs.rmSync(path.join(root,'one'),{recursive:true,force:true});
      assert.doesNotThrow(()=>validateAgentRuntime(path.join(root,'two'),second));
      const alternate=path.join(root,'alternate-node');fs.writeFileSync(alternate,'different node bytes');
      const separate=prepareAgentRuntime({dataRoot:path.join(root,'alternate'),packageRoot,entry:'build/entry.js',node:alternate});
      assert.equal(shareFixtureNode(separate,env),separate);assert.notEqual(fs.statSync(separate.node).ino,fs.statSync(second.node).ino);
      // Deliberate immutable-input violation must be rejected before replacing a private node.
      const seed=path.join(inputRoot,'node');fs.chmodSync(seed,0o700);
      const fd=fs.openSync(seed,'r+');try{fs.writeSync(fd,Buffer.from([0]),0,1,0);}finally{fs.closeSync(fd);}fs.chmodSync(seed,0o500);
      const third=prepare('three');assert.equal(third.digest,first.digest,'the installed executable was never linked or modified');
      assert.throws(()=>shareFixtureNode(third,env),/content changed/);
      assert.doesNotThrow(()=>validateAgentRuntime(path.join(root,'three'),third));
      return 0;
    } finally { fs.rmSync(root,{recursive:true,force:true}); }
  },{});
  assert.equal(result,0);assert.equal(fs.existsSync(inputRoot),false);
});
