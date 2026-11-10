import test from 'node:test';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { IsolatedFileWatchers } from '../../src/modules/code/infrastructure/source-control-watch-process.ts';

// SIGSTOP reproduces a native call that never returns. It must not prevent
// host timers, HTTP handling or a bounded close; only the owned child is killed.
test('a stuck native watcher cannot block host timers or bounded shutdown', {timeout:10000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-watch-process-'));
  const pool = new IsolatedFileWatchers();
  t.after(async () => { await pool.close(); fs.rmSync(root, {recursive:true, force:true}); });
  const watcher = await pool.watch(root, true, () => {});
  const child = (pool as unknown as {child:ChildProcess}).child;
  assert.ok(child.pid); assert.notEqual(child.pid, process.pid);
  assert.equal(child.kill('SIGSTOP'), true);
  const server = createServer((_request, response) => response.end('responsive'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}`, {signal:AbortSignal.timeout(500)});
  assert.equal(await response.text(), 'responsive');
  const started = performance.now();
  let tick = false; const timer = setTimeout(() => {tick = true;}, 20);
  watcher.close();
  await pool.close(); clearTimeout(timer);
  assert.equal(tick, true);
  assert.ok(performance.now()-started < 2500);
  assert.throws(() => process.kill(child.pid!, 0), {code:'ESRCH'});
  await pool.close();
});

test('native change notifications pass through the child and released watchers stay quiet', {timeout:12000}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-watch-delivery-'));
  const pool = new IsolatedFileWatchers();
  t.after(async () => { await pool.close(); fs.rmSync(root, {recursive:true, force:true}); });
  let seen = false;
  const watcher = await pool.watch(root, true, (_event, filename) => { if (filename?.startsWith('live-')) seen = true; });
  const start = Date.now(); let writes = 0;
  while (!seen && Date.now()-start<8000) {
    fs.writeFileSync(path.join(root, 'live-'+writes++), 'changed');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(seen, true); watcher.close();
  await pool.close();
});

test('retiring a repository during asynchronous watch registration releases its late handle', async t => {
  const {SourceControlWatchers} = await import('../../src/modules/code/infrastructure/source-control-watcher.ts');
  const {execFileSync} = await import('node:child_process');
  const {EventEmitter} = await import('node:events');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-watch-retirement-')));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  execFileSync('git',['-C',root,'init','--initial-branch=main'],{stdio:'ignore'});
  let entered!:()=>void, release!:()=>void, open=0;
  const began=new Promise<void>(resolve=>{entered=resolve;}), gate=new Promise<void>(resolve=>{release=resolve;});
  const watchers=new SourceControlWatchers({changed(){},diagnostic(){},watchFiles:async()=>{
    entered();await gate;open++;
    return Object.assign(new EventEmitter(),{close(){open--;}});
  }});
  t.after(()=>watchers.close());
  const updating=watchers.update('retired',[root]);await began;
  watchers.remove('retired');release();
  assert.equal(await updating,false);
  assert.equal(open,0,'the late native handle cannot restore a retired owner');
});
